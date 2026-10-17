"""Dashboard JSON API (CONTRACT "HTTP API"). Every handler resolves its repo first and enforces a minimum role.

Roles: viewer = read-only numbers/config; maintainer = anything showing item text from queues, reports or
external submissions (security reports must not leak to every GitHub user who can read a public repo) and
all triage actions; admin = enable/disable repos and CI tokens.
"""
import hashlib
import json
import secrets
from typing import Annotated, Literal

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field

from app import audit, auth, db
from app.questions import QUESTIONS, base_id
from app.redis_client import redis
from app.settings import settings

router = APIRouter()
UserDep = Annotated[auth.User, Depends(auth.current_user)]
Limit = Annotated[int, Query(ge=1, le=200)]

# real -> numeric -> float8 keeps 0.9 as 0.9 in JSON
_DEC = ("id, run_id, item_id, repo_id, question_id, base_question, answer, probabilities, outcome, "
        "confidence::numeric::float8 AS confidence, threshold_at_time::numeric::float8 AS threshold")
_ITEM = "id, kind, github_number, title, html_url, author, created_at"

UPPER_BOUND_NOTE = (
    "Backfill accuracy is an upper bound. The model may have seen these public issues in training "
    "(contamination), and closed issues and merged PRs are survivors: rejected, abandoned and still-open "
    "work is under-represented. Truth labels are the first labels a maintainer applied, not guaranteed correct. "
    "Expect live accuracy to be lower; shadow mode measures it on new items."
)


def _page(rows: list[dict], limit: int, shape=lambda r: r) -> dict:
    """rows were fetched with limit + 1; the cursor is the last returned id."""
    return {"items": [shape(r) for r in rows[:limit]], "next_cursor": str(rows[limit - 1]["id"]) if len(rows) > limit else None}


def _summary(i: dict) -> dict:
    return {"id": i["id"], "kind": i["kind"], "number": i["github_number"], "title": i["title"],
            "html_url": i["html_url"], "author": i["author"], "created_at": i["created_at"]}


def _options(d: dict) -> list[str]:
    q = QUESTIONS.get(base_id(d["question_id"]))
    if q and q.type == "noul":
        return ["true", "false"]
    if q and q.type == "choice" and isinstance(q.criteria, dict):
        return list(q.criteria)
    if q and q.type == "score" and isinstance(q.criteria, list):
        return [str(i) for i in range(len(q.criteria))]
    return list(d["probabilities"])  # route.* criteria are per-repo


def _suggestions(item_ids: list[int]) -> dict[int, list[dict]]:
    """Queued/shadow decisions of each item's latest error-free run."""
    out: dict[int, list[dict]] = {}
    for d in db.fetch_all(
        f"""SELECT {_DEC} FROM decisions WHERE outcome IN ('queued', 'shadow') AND run_id IN
              (SELECT max(id) FROM decision_runs WHERE item_id = ANY(%s) AND error IS NULL GROUP BY item_id)
            ORDER BY id""", (item_ids,)):
        out.setdefault(d["item_id"], []).append(d)
    return out


def _truth(c, item_id: int, qid: str, answer: str) -> None:
    c.execute(
        "INSERT INTO ground_truth (item_id, question_id, answer, source) VALUES (%s, %s, %s, 'override') "
        "ON CONFLICT (item_id, question_id) DO UPDATE SET answer = EXCLUDED.answer, source = 'override', created_at = now()",
        (item_id, qid, answer))


def _record(c, user: auth.User, d: dict, answer: str) -> None:
    """A maintainer's verdict on one decision: override row when it differs, ground truth either way."""
    if answer != d["answer"]:
        c.execute("INSERT INTO overrides (decision_id, github_user_id, user_login, new_answer) VALUES (%s, %s, %s, %s)",
                  (d["id"], user.id, user.login, answer))
    _truth(c, d["item_id"], d["question_id"], answer)  # base id, or full id for gate.same_as#n


def _installation_ids(user: auth.User) -> list[int]:
    key = f"jev:installs:{user.id}"
    if (hit := redis.get(key)) is not None:
        return json.loads(hit)
    try:
        r = httpx.get("https://api.github.com/user/installations", params={"per_page": 100}, timeout=15,
                      headers={"Authorization": f"Bearer {user.token}", "Accept": "application/vnd.github+json"})
    except httpx.HTTPError:
        raise HTTPException(502, "could not reach GitHub")
    if r.status_code != 200:
        raise HTTPException(401 if r.status_code == 401 else 502, "GitHub rejected the session token")
    ids = [i["id"] for i in r.json()["installations"]]  # ponytail: first 100 installations only
    redis.set(key, json.dumps(ids), ex=300)
    return ids


def _question(question_id: str) -> str:
    if question_id not in QUESTIONS:
        raise HTTPException(404, "unknown question")
    return question_id


@router.get("/api/me")
def me(user: UserDep):
    orgs = db.fetch_all("SELECT id, login, avatar_url FROM orgs WHERE github_installation_id = ANY(%s) ORDER BY login",
                        (_installation_ids(user),))
    return {"login": user.login, "avatar_url": user.avatar_url, "orgs": orgs}


@router.get("/api/orgs/{org_id}/overview")
def overview(org_id: int, user: UserDep):
    from app import metrics
    org = db.fetch_one("SELECT id, login FROM orgs WHERE id = %s", (org_id,))
    if not org:
        raise HTTPException(404, "org not found")
    repos = {r["id"]: r for r in db.fetch_all("SELECT * FROM repos WHERE org_id = %s", (org_id,))}
    cards = []
    for card in metrics.overview(org_id):
        if r := auth.role(user, repos[card["id"]]):
            cards.append({**card, "role": r})
    return {"org": org, "repos": cards}


def _detail(repo: dict) -> dict:
    from app import metrics, repo_config
    cfg = repo_config.load(repo)
    row = db.fetch_one("SELECT * FROM repos WHERE id = %s", (repo["id"],))  # load() may have refreshed config columns
    jev = settings.decision_backend == "jev"
    questions = []
    for q in QUESTIONS.values():
        s = metrics.question_stats(row["id"], q.id)
        questions.append({"id": q.id, "feature": q.feature, "type": q.type, "default_threshold": q.default_threshold,
                          "threshold": cfg.thresholds.get(q.id, q.default_threshold), "n": s.n, "accuracy": s.accuracy,
                          "measured": s.n >= cfg.evaluation.min_samples})
    return {
        "id": row["id"], "full_name": row["full_name"], "private": row["private"], "enabled": row["enabled"],
        "role": repo["role"], "default_branch": row["default_branch"], "backend": settings.decision_backend,
        "model": cfg.model or (settings.jev_model if jev else settings.anthropic_model), "calibrated": jev,
        "features": {k: f.mode for k, f in cfg.features.items()}, "backfill_status": row["backfill_status"],
        "config_source": row["config_source"], "questions": questions,
    }


@router.get("/api/repos/{repo_id}")
def get_repo(repo_id: int, user: UserDep):
    return _detail(auth.require_repo(user, repo_id))


class RepoPatch(BaseModel):
    enabled: bool
    acknowledge_private: bool = False


@router.patch("/api/repos/{repo_id}")
def patch_repo(repo_id: int, body: RepoPatch, user: UserDep):
    repo = auth.require_repo(user, repo_id, "admin")
    ack = repo["private_ack_by"]
    if body.enabled and repo["private"]:
        if not body.acknowledge_private:
            raise HTTPException(400, "acknowledge_private is required: private repo content is sent to the decision backend")
        ack = user.login
    db.execute("UPDATE repos SET enabled = %s, private_ack_by = %s WHERE id = %s", (body.enabled, ack, repo_id))
    audit.log(repo["org_id"], repo_id, user.login, "repo.enable" if body.enabled else "repo.disable", repo["full_name"],
              {"acknowledge_private": body.acknowledge_private})
    return _detail(repo)


@router.get("/api/repos/{repo_id}/queue")
def queue(repo_id: int, user: UserDep, bucket: Literal["review", "held"] = "review", cursor: int | None = None, limit: Limit = 50):
    auth.require_repo(user, repo_id, "maintainer")
    rows = db.fetch_all(
        """SELECT *, extract(epoch FROM now() - created_at) / 3600 AS age_hours FROM queue_items
           WHERE repo_id = %s AND bucket = %s AND status = 'open' AND id > %s ORDER BY id LIMIT %s""",
        (repo_id, bucket, cursor or 0, limit + 1))
    ids = [r["item_id"] for r in rows[:limit]]
    items = {i["id"]: i for i in db.fetch_all(f"SELECT {_ITEM} FROM items WHERE id = ANY(%s)", (ids,))}
    sugg = _suggestions(ids)
    return _page(rows, limit, lambda r: {
        "id": r["id"], "item": _summary(items[r["item_id"]]), "feature": r["feature"], "reason": r["reason"],
        "bucket": r["bucket"], "created_at": r["created_at"], "age_hours": round(float(r["age_hours"]), 1),
        "suggestions": [{"decision_id": d["id"], "question_id": d["question_id"], "answer": d["answer"],
                         "confidence": d["confidence"], "threshold": d["threshold"], "options": _options(d),
                         "probabilities": d["probabilities"]} for d in sugg.get(r["item_id"], [])],
    })


class Resolve(BaseModel):
    action: Literal["accept", "dismiss", "release"]
    answers: dict[str, str] = {}


def _label_for(cfg, question: str, answer: str) -> str | None:
    if question in ("issue.type", "priority", "route.area"):
        return cfg.label(question, answer)
    if question == "spam" and answer == "true":
        return cfg.label("spam")
    return None


@router.post("/api/queue/{queue_id}/resolve")
def resolve(queue_id: int, body: Resolve, user: UserDep):
    q = db.fetch_one("SELECT * FROM queue_items WHERE id = %s", (queue_id,))
    if not q:
        raise HTTPException(404, "queue item not found")
    repo = auth.require_repo(user, q["repo_id"], "maintainer")
    if q["status"] != "open":
        raise HTTPException(409, f"already {q['status']}")
    if body.action == "release" and q["bucket"] != "held":
        raise HTTPException(400, "only held items can be released")
    item = db.fetch_one("SELECT * FROM items WHERE id = %s", (q["item_id"],))
    github = item["github_number"] is not None
    decisions, final = [], {}

    # Side effects first: a GitHub failure leaves the entry open so the maintainer can retry.
    if body.action == "accept":
        from app import actions, repo_config
        decisions = _suggestions([item["id"]]).get(item["id"], [])
        for d in decisions:
            final[d["id"]] = body.answers.get(str(d["id"]), d["answer"])
            if final[d["id"]] not in _options(d):
                raise HTTPException(400, f"invalid answer for decision {d['id']}")
        cfg = repo_config.load(repo)
        for d in decisions:
            if github and (name := _label_for(cfg, d["base_question"], final[d["id"]])):
                actions.label(item, repo, [name], d["id"])
    elif body.action == "release":
        from app import actions, pipeline, repo_config
        if github and (held := repo_config.load(repo).label("held")):
            actions.unlabel(item, repo, held, None)
        pipeline.process(repo, item["kind"], {
            "number": item["github_number"], "title": item["title"], "body": item["body"],
            "user": {"login": item["author"]}, "author_association": item["author_association"],
            "html_url": item["html_url"], "created_at": item["created_at"].isoformat(),
        }, trigger="release")

    status = {"accept": "accepted", "dismiss": "dismissed", "release": "released"}[body.action]
    with db.transaction() as c:
        claimed = c.execute("UPDATE queue_items SET status = %s, resolved_by = %s, resolved_at = now() "
                            "WHERE id = %s AND status = 'open' RETURNING id", (status, user.login, queue_id)).fetchone()
        if not claimed:
            raise HTTPException(409, "already resolved")
        for d in decisions:
            _record(c, user, d, final[d["id"]])
        if body.action == "release":
            _truth(c, item["id"], "gate.grounded", "true")
            _truth(c, item["id"], "gate.known_non_issue", "false")
    audit.log(repo["org_id"], repo["id"], user.login, f"queue.{body.action}", str(queue_id),
              {"item_id": item["id"], "answers": final})
    return {"ok": True}


@router.get("/api/items/{item_id}")
def get_item(item_id: int, user: UserDep):
    item = db.fetch_one("SELECT * FROM items WHERE id = %s", (item_id,))
    if not item:
        raise HTTPException(404, "item not found")
    auth.require_repo(user, item["repo_id"], "viewer" if item["kind"] in ("issue", "pr") else "maintainer")
    by_run: dict[int, list] = {}
    for d in db.fetch_all(f"SELECT {_DEC} FROM decisions WHERE item_id = %s ORDER BY id", (item_id,)):
        by_run.setdefault(d["run_id"], []).append({
            "id": d["id"], "question_id": d["question_id"], "answer": d["answer"], "confidence": d["confidence"],
            "threshold": d["threshold"], "outcome": d["outcome"], "probabilities": d["probabilities"]})
    runs = [{**{k: r[k] for k in ("id", "trigger", "model_version", "backend", "calibrated", "latency_ms", "tokens_in",
                                  "cost_usd", "created_at", "error", "state_text")}, "decisions": by_run.get(r["id"], [])}
            for r in db.fetch_all("SELECT * FROM decision_runs WHERE item_id = %s ORDER BY id DESC", (item_id,))]
    return {
        "item": {**_summary(item), "body": item["body"], "repo_id": item["repo_id"], "state": item["state"]},
        "runs": runs,
        "actions": db.fetch_all("SELECT id, kind, github_ref, coalesce((payload->>'dry_run')::boolean, false) AS dry_run, "
                                "created_at FROM actions WHERE item_id = %s ORDER BY id", (item_id,)),
        "overrides": db.fetch_all("SELECT o.id, o.decision_id, o.user_login AS user, o.new_answer, o.created_at FROM overrides o "
                                  "JOIN decisions d ON d.id = o.decision_id WHERE d.item_id = %s ORDER BY o.id", (item_id,)),
    }


class Override(BaseModel):
    answer: str


@router.post("/api/decisions/{decision_id}/override")
def override(decision_id: int, body: Override, user: UserDep):
    d = db.fetch_one(f"SELECT {_DEC} FROM decisions WHERE id = %s", (decision_id,))
    if not d:
        raise HTTPException(404, "decision not found")
    repo = auth.require_repo(user, d["repo_id"], "maintainer")
    if body.answer not in _options(d):
        raise HTTPException(400, "invalid answer")
    with db.transaction() as c:
        _record(c, user, d, body.answer)
    audit.log(repo["org_id"], repo["id"], user.login, "decision.override", str(decision_id),
              {"question_id": d["question_id"], "from": d["answer"], "to": body.answer})
    return {"ok": True}


@router.get("/api/repos/{repo_id}/preview")
def preview(repo_id: int, question_id: str, user: UserDep):
    from app import metrics, repo_config
    repo = auth.require_repo(user, repo_id)
    q = QUESTIONS[_question(question_id)]
    points = [{"confidence": p["confidence"], "correct": None if p["truth"] is None else p["answer"] == p["truth"]}
              for p in metrics.preview_points(repo_id, question_id)]
    return {"question_id": question_id, "threshold": repo_config.load(repo).thresholds.get(q.id, q.default_threshold),
            "points": points}


@router.get("/api/repos/{repo_id}/calibration")
def calibration(repo_id: int, question_id: str, user: UserDep):
    from app import metrics
    auth.require_repo(user, repo_id)
    s = metrics.question_stats(repo_id, _question(question_id))
    return {"question_id": question_id, "n": s.n, "ece": s.ece, "bins": metrics.calibration(repo_id, question_id)}


@router.get("/api/repos/{repo_id}/evaluation")
def evaluation(repo_id: int, user: UserDep):
    from app import metrics
    repo = auth.require_repo(user, repo_id)
    questions = []
    for qid in QUESTIONS:
        s = metrics.question_stats(repo_id, qid)
        if s.n:
            questions.append({"id": qid, "n": s.n, "accuracy": s.accuracy, "ece": s.ece,
                              "recommended_threshold": metrics.recommended_threshold(repo_id, qid),
                              "confusion": metrics.confusion(repo_id, qid),
                              "worst_misses": metrics.worst_misses(repo_id, qid)})
    return {"backfill_status": repo["backfill_status"], "upper_bound_note": UPPER_BOUND_NOTE, "questions": questions}


@router.post("/api/repos/{repo_id}/backfill")
def backfill(repo_id: int, user: UserDep):
    from app import jobs
    repo = auth.require_repo(user, repo_id, "maintainer")
    db.execute("UPDATE repos SET backfill_status = 'queued' WHERE id = %s", (repo_id,))
    jobs.enqueue("backfill", repo_id=repo_id)
    audit.log(repo["org_id"], repo_id, user.login, "backfill.queue", repo["full_name"])
    return {"queued": True}


@router.get("/api/repos/{repo_id}/ci-reports")
def ci_reports(repo_id: int, user: UserDep, cursor: int | None = None, limit: Limit = 50):
    auth.require_repo(user, repo_id, "maintainer")
    rows = db.fetch_all("SELECT * FROM ci_reports WHERE repo_id = %s AND id < %s ORDER BY id DESC LIMIT %s",
                        (repo_id, cursor or 2**62, limit + 1))
    cands: dict[int, list] = {}
    for c in db.fetch_all(
        """SELECT c.report_id, i.id AS item_id, i.github_number AS number, i.title, c.retrieval_score, c.same_as_probability
           FROM ci_candidates c JOIN items i ON i.id = c.candidate_item_id
           WHERE c.report_id = ANY(%s) ORDER BY c.retrieval_score DESC""", ([r["id"] for r in rows[:limit]],)):
        cands.setdefault(c.pop("report_id"), []).append(c)
    return _page(rows, limit, lambda r: {
        "id": r["id"], "created_at": r["created_at"], "title": r["payload"].get("title", ""), "source": r["source"],
        "outcome": r["outcome"], "issue_number": r["filed_issue_number"], "merged_into": r["merged_into_number"],
        "run_url": r["payload"].get("run_url"), "candidates": cands.get(r["id"], [])})


@router.get("/api/repos/{repo_id}/flaky-tests")
def flaky_tests(repo_id: int, user: UserDep):
    auth.require_repo(user, repo_id)
    return {"items": db.fetch_all(
        "SELECT test_id, occurrences, first_seen, last_seen, last_run_url FROM flaky_tests WHERE repo_id = %s "
        "ORDER BY occurrences DESC, test_id LIMIT 200", (repo_id,))}


@router.get("/api/repos/{repo_id}/config")
def get_config(repo_id: int, user: UserDep):
    from app import repo_config
    from app.github import client_for
    repo = auth.require_repo(user, repo_id)
    parsed = repo_config.load(repo).model_dump(mode="json")
    text = repo_config.render_yaml(parsed)
    row = db.fetch_one("SELECT config_source FROM repos WHERE id = %s", (repo_id,))
    return {"yaml": text, "source": row["config_source"], "parsed": parsed,
            "edit_url": repo_config.edit_url(repo["full_name"], repo["default_branch"], text, row["config_source"] == "repo"),
            "labels": client_for(repo).list_labels(repo["full_name"])}


class Render(BaseModel):
    parsed: dict


@router.post("/api/repos/{repo_id}/config/render")
def render_config(repo_id: int, body: Render, user: UserDep):
    from app import repo_config
    repo = auth.require_repo(user, repo_id)
    text = repo_config.render_yaml(body.parsed)
    try:
        repo_config.parse_config(text)
        errors = []
    except ValueError as e:  # "invalid config: a.b: msg; c: msg"
        errors = str(e).removeprefix("invalid config: ").split("; ")
    exists = repo["config_source"] == "repo"
    return {"yaml": text, "edit_url": repo_config.edit_url(repo["full_name"], repo["default_branch"], text, exists),
            "errors": errors}


@router.post("/api/repos/{repo_id}/labels/sync")
def sync_labels(repo_id: int, user: UserDep):
    from app import install
    repo = auth.require_repo(user, repo_id, "maintainer")
    created = install.ensure_labels(repo)
    audit.log(repo["org_id"], repo_id, user.login, "labels.sync", repo["full_name"], {"created": created})
    return {"created": created}


@router.get("/api/repos/{repo_id}/ci-tokens")
def list_tokens(repo_id: int, user: UserDep):
    auth.require_repo(user, repo_id, "admin")
    return {"items": db.fetch_all("SELECT id, name, created_by, created_at, revoked_at FROM ci_tokens "
                                  "WHERE repo_id = %s ORDER BY id DESC", (repo_id,))}


class NewToken(BaseModel):
    name: str = Field(min_length=1, max_length=100)


@router.post("/api/repos/{repo_id}/ci-tokens")
def create_token(repo_id: int, body: NewToken, user: UserDep):
    repo = auth.require_repo(user, repo_id, "admin")
    token = "jt_" + secrets.token_urlsafe(32)
    row = db.fetch_one("INSERT INTO ci_tokens (repo_id, name, token_hash, created_by) VALUES (%s, %s, %s, %s) RETURNING id",
                       (repo_id, body.name, hashlib.sha256(token.encode()).hexdigest(), user.login))
    audit.log(repo["org_id"], repo_id, user.login, "ci_token.create", body.name, {"token_id": row["id"]})
    return {"id": row["id"], "name": body.name, "token": token}  # plaintext is never stored


@router.delete("/api/repos/{repo_id}/ci-tokens/{token_id}")
def revoke_token(repo_id: int, token_id: int, user: UserDep):
    repo = auth.require_repo(user, repo_id, "admin")
    row = db.fetch_one("UPDATE ci_tokens SET revoked_at = now() WHERE id = %s AND repo_id = %s AND revoked_at IS NULL "
                       "RETURNING name", (token_id, repo_id))
    if not row:
        raise HTTPException(404, "token not found")
    audit.log(repo["org_id"], repo_id, user.login, "ci_token.revoke", row["name"], {"token_id": token_id})
    return {"ok": True}


@router.get("/api/repos/{repo_id}/audit")
def audit_log(repo_id: int, user: UserDep, cursor: int | None = None, limit: Limit = 50):
    auth.require_repo(user, repo_id, "maintainer")
    rows = db.fetch_all("SELECT id, actor, action, target, details, created_at FROM audit_log "
                        "WHERE repo_id = %s AND id < %s ORDER BY id DESC LIMIT %s", (repo_id, cursor or 2**62, limit + 1))
    return _page(rows, limit)
