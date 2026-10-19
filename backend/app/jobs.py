"""Redis list queue + job handlers. `python -m app.worker` pops and runs them."""
import json

from app import db
from app.redis_client import redis
from app.settings import settings

QUEUE, DEAD = "jev:jobs", "jev:jobs:dead"
CONFIG_PATHS = {".github/oss-inbox.yml", ".github/jev-triage.yml"}  # the second is the pre-rename name, still read


def enqueue(job_type: str, **payload) -> None:
    redis.rpush(QUEUE, json.dumps({"type": job_type, "payload": payload, "attempts": 0}))


def _set_state(repo: dict, kind: str, number: int, state: str) -> None:
    db.execute("UPDATE items SET state = %s, updated_at = now() WHERE repo_id = %s AND kind = %s AND github_number = %s",
               (state, repo["id"], kind, number))


def _push(repo: dict, payload: dict) -> None:
    branch = (payload.get("repository") or {}).get("default_branch") or repo["default_branch"]
    if payload.get("ref") != f"refs/heads/{branch}":
        return
    touched = {p for c in payload.get("commits") or [] for k in ("added", "modified", "removed") for p in c.get(k, [])}
    if repo["full_name"].endswith("/.github") and CONFIG_PATHS & touched:  # org defaults changed: every repo re-reads
        ids = [r["id"] for r in db.fetch_all("SELECT id FROM repos WHERE org_id = %s AND enabled", (repo["org_id"],))]
    elif repo["enabled"] and touched & {*CONFIG_PATHS, (repo["config"] or {}).get("rules_file")}:
        ids = [repo["id"]]
    else:
        return
    for repo_id in ids:
        enqueue("sync_repo", repo_id=repo_id)


def webhook(event: str, payload: dict) -> None:
    from app import install, pipeline  # lazy: keeps the API process import-light

    if event in ("installation", "installation_repositories"):
        return install.handle_installation(event, payload)
    repo = db.fetch_one("SELECT * FROM repos WHERE github_repo_id = %s", ((payload.get("repository") or {}).get("id"),))
    if repo is None:
        return
    if event == "push":
        return _push(repo, payload)
    if not repo["enabled"]:
        return
    action = payload.get("action")
    if event == "issues":
        issue = payload["issue"]
        if action in ("opened", "reopened") or (action == "edited" and {"body", "title"} & set(payload.get("changes") or {})):
            pipeline.process(repo, "issue", issue, action)
        elif action == "closed":
            _set_state(repo, "issue", issue["number"], "closed")
        elif action == "deleted":
            db.execute("DELETE FROM items WHERE repo_id = %s AND kind = 'issue' AND github_number = %s",
                       (repo["id"], issue["number"]))
    elif event == "pull_request":
        pr = payload["pull_request"]
        if action in ("opened", "reopened", "synchronize", "ready_for_review"):
            if not pr.get("draft"):
                pipeline.process(repo, "pr", pr, action)
        elif action == "closed":
            _set_state(repo, "pr", pr["number"], "merged" if pr.get("merged") else "closed")


def sync_repo(repo_id: int) -> None:
    from app import repo_config

    repo = db.fetch_one("SELECT * FROM repos WHERE id = %s", (repo_id,))
    if repo:
        repo_config.load(repo, refresh=True)


def run_backfill(repo_id: int, limit: int | None = None) -> None:
    from app import backfill

    backfill.run(repo_id, limit)


def reprocess(item_id: int, trigger: str = "release") -> None:
    """Re-run the pipeline for a stored item (e.g. after a maintainer releases a held one)."""
    from app import pipeline

    item = db.fetch_one("SELECT * FROM items WHERE id = %s", (item_id,))
    if not item or item["kind"] not in ("issue", "pr"):
        return
    repo = db.fetch_one("SELECT * FROM repos WHERE id = %s", (item["repo_id"],))
    pipeline.process(repo, item["kind"], {
        "number": item["github_number"], "title": item["title"], "body": item["body"], "state": item["state"],
        "user": {"login": item["author"]}, "author_association": item["author_association"],
        "html_url": item["html_url"], "created_at": item["created_at"].isoformat(),
        "head": {"sha": (item["extra"] or {}).get("head_sha")}, "labels": [],
    }, trigger)


def purge() -> None:
    """Drop stored text (decision state, item bodies) not touched for retention_days."""
    if settings.retention_days <= 0:
        return
    age = "now() - make_interval(days => %s)"
    db.execute(f"UPDATE decision_runs SET state_text = NULL WHERE state_text IS NOT NULL AND created_at < {age}",
               (settings.retention_days,))
    db.execute(f"UPDATE items SET body = '' WHERE body <> '' AND updated_at < {age}", (settings.retention_days,))


HANDLERS = {"webhook": webhook, "backfill": run_backfill, "sync_repo": sync_repo, "purge": purge, "reprocess": reprocess}
