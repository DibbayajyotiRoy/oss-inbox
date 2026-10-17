"""Replay closed issues and merged PRs through the pipeline (no actions) and take the labels a human applied first
as ground truth. Not covered: duplicates (they need a per-candidate question, so no truth is recorded for them)."""
import logging
from datetime import datetime, timezone

from psycopg.types.json import Jsonb

from app import db
from app.questions import QUESTIONS
from app.settings import settings

log = logging.getLogger(__name__)

_QUESTIONS_FOR = {"issue": {"issue.type", "priority", "route.area", "spam"}, "pr": {"pr.breaking", "priority", "route.area", "spam"}}
_SOURCES = (  # kind, REST path, filter
    ("issue", "issues", lambda i: "pull_request" not in i),
    ("pr", "pulls", lambda p: p.get("merged_at")),
)


def _label_map(cfg) -> dict[str, tuple[str, str]]:
    """lowercased label name -> (question, answer) for every label the config knows."""
    m = {}
    for qid in ("issue.type", "priority"):
        for ans in QUESTIONS[qid].criteria:
            if name := cfg.label(qid, ans):
                m[name.lower()] = (qid, ans)
    for area in cfg.areas:
        m[cfg.label("route.area", area).lower()] = ("route.area", area)
    for qid, key in (("spam", "spam"), ("pr.breaking", "breaking")):
        if name := cfg.label(key):
            m[name.lower()] = (qid, "true")
    return m


def _truth(events, kind, lmap, breaking_exists) -> dict[str, str]:
    out = {}
    for e in sorted((e for e in events if e.get("event") == "labeled"), key=lambda e: e.get("created_at") or ""):
        actor = e.get("actor") or {}
        if actor.get("type") == "Bot" or str(actor.get("login", "")).endswith("[bot]"):
            continue
        hit = lmap.get(((e.get("label") or {}).get("name") or "").lower())
        if hit and hit[0] in _QUESTIONS_FOR[kind]:
            out.setdefault(*hit)  # earliest wins
    if kind == "pr" and breaking_exists:
        out.setdefault("pr.breaking", "false")
    return out


def _total(gh, name: str, limit: int) -> int | None:
    """Most items this run can visit (for the progress bar); None if GitHub search is unavailable."""
    try:
        return sum(min(limit, gh.request("GET", "/search/issues", params={"q": f"repo:{name} {q}", "per_page": 1})["total_count"])
                   for q in ("is:issue is:closed", "is:pr is:merged"))
    except Exception:
        return None


def _progress(repo_id: int, counts: dict, total: int | None, started: str, finished: str | None = None) -> None:
    db.execute("UPDATE repos SET backfill_progress = %s WHERE id = %s",
               (Jsonb({**counts, "total": total, "started_at": started, "finished_at": finished}), repo_id))


def run(repo_id: int, limit: int | None = None) -> dict:
    """Process up to `limit` closed issues and `limit` merged PRs (default settings.backfill_limit each)."""
    from app import github, pipeline, repo_config  # lazy: pipeline imports metrics via engine

    repo = db.fetch_one("SELECT * FROM repos WHERE id = %s", (repo_id,))
    if repo is None:
        raise ValueError(f"repo {repo_id} not found")
    limit = settings.backfill_limit if limit is None else limit
    counts = {"processed": 0, "with_truth": 0, "errors": 0}
    status, total, started = "done", None, datetime.now(timezone.utc).isoformat()
    db.execute("UPDATE repos SET backfill_status = 'running' WHERE id = %s", (repo_id,))
    _progress(repo_id, counts, total, started)
    try:
        if not repo["enabled"]:  # never send content of a repo the admin has not enabled (private ones need an ack)
            raise RuntimeError("repo is not enabled")
        gh, name = github.client_for(repo), repo["full_name"]
        cfg = repo_config.load(repo)
        lmap = _label_map(cfg)
        breaking = cfg.label("breaking")
        breaking_exists = bool(breaking) and breaking.lower() in {x.lower() for x in gh.list_labels(name)}
        total = _total(gh, name, limit)
        _progress(repo_id, counts, total, started)
        for kind, path, keep in _SOURCES:
            seen = 0
            for it in gh.paginate(f"/repos/{name}/{path}", {"state": "closed", "sort": "created", "direction": "desc"}) if limit > 0 else ():
                if not keep(it):
                    continue
                try:
                    _one(gh, pipeline, repo, kind, it, lmap, breaking_exists, counts)
                except Exception as e:  # one bad item must not stop the run
                    counts["errors"] += 1
                    log.warning("backfill %s %s#%s failed: %s", kind, name, it.get("number"), e)
                _progress(repo_id, counts, total, started)
                seen += 1
                if seen >= limit:
                    break
    except Exception as e:
        counts["errors"] += 1
        status = f"error:{e}"[:200]
    db.execute("UPDATE repos SET backfill_status = %s WHERE id = %s", (status, repo_id))
    _progress(repo_id, counts, total, started, datetime.now(timezone.utc).isoformat())
    return counts


def _one(gh, pipeline, repo, kind, it, lmap, breaking_exists, counts) -> None:
    name, number = repo["full_name"], it["number"]
    where = (repo["id"], kind, number)
    if db.fetch_one("SELECT 1 FROM items i JOIN decision_runs r ON r.item_id = i.id WHERE i.repo_id = %s AND i.kind = %s "
                    "AND i.github_number = %s AND r.trigger = 'backfill' AND r.error IS NULL", where):
        return
    original = gh.original_body(name, number)
    events = gh.timeline(name, number)  # before the (paid) decision call so a failure here costs nothing
    payload = {**it, "body": original if original is not None else (it.get("body") or "")}
    run_id = pipeline.process(repo, kind, payload, trigger="backfill", actions_enabled=False)
    if run_id is None:  # ignored, e.g. bot author
        return
    if db.fetch_one("SELECT error FROM decision_runs WHERE id = %s", (run_id,))["error"]:
        counts["errors"] += 1
        return
    counts["processed"] += 1
    truth = _truth(events, kind, lmap, breaking_exists)
    item = db.fetch_one("SELECT id FROM items WHERE repo_id = %s AND kind = %s AND github_number = %s", where)
    for qid, answer in truth.items():
        db.execute("INSERT INTO ground_truth (item_id, question_id, answer, source) VALUES (%s, %s, %s, 'backfill') "
                   "ON CONFLICT DO NOTHING", (item["id"], qid, answer))
    counts["with_truth"] += bool(truth)
