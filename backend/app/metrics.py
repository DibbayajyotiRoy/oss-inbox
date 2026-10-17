"""Accuracy, calibration and dashboard numbers. Truth = ground_truth vs the latest error-free decision."""
import json
from dataclasses import asdict, dataclass
from datetime import datetime, time, timedelta, timezone

from app import db
from app.redis_client import redis

# Latest error-free decision per (item, question id) with its truth (NULL when unlabelled).
# ground_truth.question_id is the base id, or the full id for per-candidate questions - which is
# exactly decisions.question_id in both cases. real -> numeric -> float8 keeps 0.9 as 0.9.
_LATEST = """
SELECT DISTINCT ON (d.item_id, d.question_id)
       d.id AS decision_id, d.item_id, d.answer, d.confidence::numeric::float8 AS confidence,
       d.created_at, g.answer AS truth
FROM decisions d
JOIN decision_runs r ON r.id = d.run_id AND r.error IS NULL
LEFT JOIN ground_truth g ON g.item_id = d.item_id AND g.question_id = d.question_id
WHERE d.repo_id = %s AND d.base_question = %s
ORDER BY d.item_id, d.question_id, d.created_at DESC, d.id DESC"""


@dataclass
class QuestionStats:
    question_id: str
    n: int
    accuracy: float | None
    ece: float | None


def _labelled(repo_id, qid) -> list[dict]:
    return db.fetch_all(f"SELECT * FROM ({_LATEST}) t WHERE truth IS NOT NULL", (repo_id, qid))


def _bins(rows, bins) -> list[dict]:
    acc = [[0, 0, 0.0] for _ in range(bins)]  # n, correct, sum of confidence
    for r in rows:
        b = acc[min(int(r["confidence"] * bins), bins - 1)]
        b[0] += 1
        b[1] += r["answer"] == r["truth"]
        b[2] += r["confidence"]
    return [{"lo": i / bins, "hi": (i + 1) / bins, "n": n,
             "mean_confidence": s / n if n else None, "accuracy": c / n if n else None}
            for i, (n, c, s) in enumerate(acc)]


def _ece(rows, bins=10) -> float | None:
    if not rows:
        return None
    return sum(b["n"] / len(rows) * abs(b["accuracy"] - b["mean_confidence"]) for b in _bins(rows, bins) if b["n"])


def question_stats(repo_id: int, qid: str) -> QuestionStats:
    key = f"jev:qstats:{repo_id}:{qid}"
    if cached := redis.get(key):
        return QuestionStats(**json.loads(cached))
    rows = _labelled(repo_id, qid)
    n = len(rows)
    s = QuestionStats(qid, n, sum(r["answer"] == r["truth"] for r in rows) / n if n else None, _ece(rows))
    redis.set(key, json.dumps(asdict(s)), ex=60)
    return s


def calibration(repo_id: int, qid: str, bins: int = 10) -> list[dict]:
    return _bins(_labelled(repo_id, qid), bins)


def confusion(repo_id: int, qid: str) -> dict | None:
    rows = _labelled(repo_id, qid)
    if not rows:
        return None
    labels = sorted({r["truth"] for r in rows} | {r["answer"] for r in rows})
    ix = {a: i for i, a in enumerate(labels)}
    matrix = [[0] * len(labels) for _ in labels]
    for r in rows:
        matrix[ix[r["truth"]]][ix[r["answer"]]] += 1
    return {"labels": labels, "matrix": matrix}


def worst_misses(repo_id: int, qid: str, limit: int = 20) -> list[dict]:
    return db.fetch_all(
        f"""SELECT t.item_id, i.github_number AS number, i.title, t.answer, t.truth, t.confidence, i.html_url
            FROM ({_LATEST}) t JOIN items i ON i.id = t.item_id
            WHERE t.truth IS NOT NULL AND t.answer <> t.truth
            ORDER BY t.confidence DESC, t.decision_id DESC LIMIT %s""",
        (repo_id, qid, limit))


def preview_points(repo_id: int, qid: str) -> list[dict]:
    return db.fetch_all(
        f"""SELECT decision_id, item_id, answer, confidence, truth FROM ({_LATEST}) t
            ORDER BY created_at DESC, decision_id DESC LIMIT 20000""", (repo_id, qid))


def recommended_threshold(repo_id: int, qid: str, max_error: float = 0.05) -> float | None:
    rows = _labelled(repo_id, qid)
    for k in range(50, 100):
        kept = [r for r in rows if r["confidence"] * 100 >= k - 1e-6]
        if len(kept) >= 10 and sum(r["answer"] != r["truth"] for r in kept) / len(kept) <= max_error:
            return k / 100
    return None


def overview(org_id: int, days: int = 30) -> list[dict]:
    repos = db.fetch_all("SELECT id, full_name, private, enabled FROM repos WHERE org_id = %s ORDER BY full_name", (org_id,))
    ids = [r["id"] for r in repos]
    today = datetime.now(timezone.utc).date()
    start = datetime.combine(today - timedelta(days=days - 1), time.min, timezone.utc)
    live = """FROM decisions d JOIN decision_runs r ON r.id = d.run_id
              WHERE d.repo_id = ANY(%s) AND d.created_at >= %s AND r.trigger <> 'backfill'"""

    items = {r["repo_id"]: r["n"] for r in db.fetch_all(
        "SELECT repo_id, count(*) AS n FROM items WHERE repo_id = ANY(%s) AND created_at >= %s GROUP BY repo_id", (ids, start))}
    queue = {(r["repo_id"], r["bucket"]): r["n"] for r in db.fetch_all(
        "SELECT repo_id, bucket, count(*) AS n FROM queue_items WHERE repo_id = ANY(%s) AND status = 'open' GROUP BY 1, 2", (ids,))}
    day_counts = {(r["repo_id"], r["day"], r["outcome"]): r["n"] for r in db.fetch_all(
        f"SELECT d.repo_id, (d.created_at AT TIME ZONE 'UTC')::date AS day, d.outcome, count(*) AS n {live} GROUP BY 1, 2, 3",
        (ids, start))}
    seen = {r["repo_id"]: r for r in db.fetch_all(
        f"""SELECT d.repo_id, count(DISTINCT d.item_id) AS items,
                   count(DISTINCT d.item_id) FILTER (WHERE d.outcome = 'acted') AS acted,
                   count(*) AS decisions, sum((SELECT count(*) FROM overrides o WHERE o.decision_id = d.id))::int AS overrides
            {live} GROUP BY d.repo_id""", (ids, start))}
    acc = {r["repo_id"]: r for r in db.fetch_all(
        """SELECT repo_id, count(*) AS n, count(*) FILTER (WHERE answer = truth) AS correct FROM (
             SELECT DISTINCT ON (d.item_id, d.question_id) d.repo_id, d.answer, g.answer AS truth
             FROM decisions d JOIN decision_runs r ON r.id = d.run_id AND r.error IS NULL
             JOIN ground_truth g ON g.item_id = d.item_id AND g.question_id = d.question_id
             WHERE d.repo_id = ANY(%s)
             ORDER BY d.item_id, d.question_id, d.created_at DESC, d.id DESC) t GROUP BY repo_id""", (ids,))}

    out = []
    for r in repos:
        s, a = seen.get(r["id"]), acc.get(r["id"])
        out.append({
            **r,
            "items_30d": items.get(r["id"], 0),
            "acted_share": s["acted"] / s["items"] if s else None,
            "queued_open": queue.get((r["id"], "review"), 0),
            "held_open": queue.get((r["id"], "held"), 0),
            "accuracy": a["correct"] / a["n"] if a else None,
            "override_rate": s["overrides"] / s["decisions"] if s else None,
            "trend": [{"date": str(d), **{o: day_counts.get((r["id"], d, o), 0) for o in ("acted", "queued", "shadow")}}
                      for d in (today - timedelta(days=days - 1 - i) for i in range(days))],
        })
    return out
