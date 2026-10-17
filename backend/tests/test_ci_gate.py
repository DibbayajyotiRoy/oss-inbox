import dataclasses
import hashlib
import importlib
import sys
import types
from types import SimpleNamespace

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app import db, ratelimit
from app.questions import QUESTIONS, base_id


def _ensure(name, **attrs):
    """Sibling workers' modules may not exist yet: stub them (real ones are monkeypatched per test anyway)."""
    try:
        return importlib.import_module(name)
    except ImportError:
        mod = sys.modules[name] = types.ModuleType(name)
        setattr(sys.modules["app"], name.split(".")[1], mod)
        for k, v in attrs.items():
            setattr(mod, k, v)
        return mod


@dataclasses.dataclass
class _Ctx:
    repo: dict
    config: object
    item: dict
    trigger: str
    extra: dict = dataclasses.field(default_factory=dict)
    held: bool = False


actions = _ensure("app.actions")
pipeline = _ensure("app.pipeline", Ctx=_Ctx)
repo_config = _ensure("app.repo_config")
from app import retrieval  # noqa: E402
from app.api import reports  # noqa: E402
from app.features import ci_gate  # noqa: E402

TOKEN = "jt_test_token"
AUTH = {"Authorization": f"Bearer {TOKEN}"}
DEFAULTS = {"ci.kind": ("code_bug", 0.95), "priority": ("p1", 0.95), "route.area": ("core", 0.95),
            "ci.same_as": ("false", 0.99), "gate.reproducible": ("true", 0.99), "gate.grounded": ("true", 0.99),
            "gate.known_non_issue": ("false", 0.99), "gate.claim_supported": ("true", 0.99),
            "gate.security_claim": ("false", 0.99)}


@dataclasses.dataclass
class V:
    question_id: str
    decision_id: int
    answer: str
    probabilities: dict
    confidence: float
    threshold: float
    above: bool
    eligible: bool


class Cfg:
    def __init__(self):
        self.modes = {f: "auto" for f in ("ci_gate", "priority", "routing", "inbound_gate")}
        self.areas, self.comments = {}, False
        self.ci_gate = SimpleNamespace(max_issues_per_hour=5, notify_webhook_url="https://hooks.example/x")

    def mode(self, feature):
        return self.modes[feature]

    def label(self, key, answer=None):
        return {"ci": "ci-failure", "priority": f"prio-{answer}", "route.area": f"area-{answer}"}[key]


class FakeGitHub:
    hits: list = []
    queries: list = []

    def get_tree_paths(self, repo):
        return {"src/app.py"}

    def search_issues(self, q, max_items=10):
        self.queries.append(q)
        return self.hits


@pytest.fixture
def w(monkeypatch):
    """Fake the engine/actions/pipeline boundary and record every call."""
    w = SimpleNamespace(cfg=Cfg(), script=dict(DEFAULTS), error=None, runs=[], filed=[], comments=[], queued=[],
                        notified=[], upserts=[], outcomes={}, gh=FakeGitHub())
    FakeGitHub.hits, FakeGitHub.queries = [], []
    ids = iter(range(1, 1000))

    def run(item, repo, config, trigger, state, questions):
        w.runs.append((state, questions))
        if w.error:
            return 1, {}, w.error
        out = {}
        for q in questions:
            base = base_id(q.id)
            ans, conf = w.script[base]
            probs = ({"true": conf if ans == "true" else 1 - conf, "false": conf if ans == "false" else 1 - conf}
                     if q.type == "noul" else {ans: conf})
            thr = QUESTIONS[base].default_threshold
            out[q.id] = V(q.id, next(ids), ans, probs, conf, thr, conf >= thr,
                          conf >= thr and config.mode(QUESTIONS[base].feature) == "auto")
        return 1, out, None

    def decide(ctx, v):
        if ctx.config.mode(QUESTIONS[base_id(v.question_id)].feature) != "auto":
            return "shadow"
        return "act" if v.eligible else "queue"

    def file_issue(repo, title, body, labels, decision_id):
        w.filed.append(SimpleNamespace(repo=repo, title=title, body=body, labels=labels, decision_id=decision_id))
        return {"number": 40 + len(w.filed), "html_url": "https://github.com/acme/widgets/issues/1"}

    monkeypatch.setattr(ci_gate.engine, "run", run, raising=False)
    monkeypatch.setattr(ci_gate.engine, "set_outcome", w.outcomes.__setitem__, raising=False)
    monkeypatch.setattr(pipeline, "decide", decide, raising=False)
    monkeypatch.setattr(pipeline, "enqueue_review",
                        lambda item_id, feature, reason, bucket="review": w.queued.append((feature, reason, bucket)),
                        raising=False)
    monkeypatch.setattr(pipeline, "upsert_item", lambda *a, **kw: w.upserts.append(a), raising=False)
    monkeypatch.setattr(actions, "file_issue", file_issue, raising=False)
    monkeypatch.setattr(actions, "comment", lambda item, repo, body, did, key: w.comments.append((item, body, key)),
                        raising=False)
    monkeypatch.setattr(repo_config, "load", lambda repo, refresh=False: w.cfg, raising=False)
    monkeypatch.setattr(ci_gate.notify, "send", lambda url, text: w.notified.append((url, text)))
    monkeypatch.setitem(sys.modules, "app.github", SimpleNamespace(client_for=lambda repo: w.gh))
    return w


@pytest.fixture
def api(repo):
    db.execute("INSERT INTO ci_tokens (repo_id, name, token_hash, created_by) VALUES (%s, 't', %s, 'me')",
               (repo["id"], hashlib.sha256(TOKEN.encode()).hexdigest()))
    app = FastAPI()
    app.include_router(reports.router)
    c = TestClient(app)

    def post(headers=AUTH, **kw):
        return c.post("/api/v1/reports", headers=headers, json={
            "repo": "acme/widgets", "title": "upload retry timeout", "body": "upload hangs after retry"} | kw)
    return post


def seed_issue(repo, number, title, state="open", kind="issue"):
    return db.fetch_one("""INSERT INTO items (repo_id, kind, github_number, title, body, source, state)
                           VALUES (%s, %s, %s, %s, %s, 'webhook', %s) RETURNING *""",
                        (repo["id"], kind, number, title, title, state))


# ---- auth / validation / rate limit -------------------------------------------------------------

def test_token_auth(api, repo):
    assert api(headers={}).status_code == 401
    assert api(headers={"Authorization": "Bearer nope"}).status_code == 401
    assert api(headers={"Authorization": f"Basic {TOKEN}"}).status_code == 401
    db.execute("UPDATE ci_tokens SET revoked_at = now()")
    assert api().status_code == 401


def test_wrong_repo_and_disabled_repo(api, repo, w):
    assert api(repo="acme/other").status_code == 403
    assert api(repo="ACME/Widgets").status_code == 200
    db.execute("UPDATE repos SET enabled = false")
    assert api().status_code == 403


def test_validation(api, repo):
    assert api(title="x" * 257).status_code == 422
    assert api(title="").status_code == 422
    assert api(body="b" * 65_001).status_code == 422
    assert api(run_url="javascript:alert(1)").status_code == 422


def test_request_rate_limit(api, repo, w):
    for _ in range(120):
        assert ratelimit.allow(f"reports:{repo['id']}", 120, 60)
    r = api()
    assert r.status_code == 429 and r.headers["retry-after"] == "60"


def test_ratelimit_window():
    assert [ratelimit.allow("k", 2, 60) for _ in range(3)] == [True, True, False]
    from app.redis_client import redis
    assert 0 < redis.ttl("rl:k") <= 60


# ---- outcome branches ---------------------------------------------------------------------------

def test_filed(api, repo, w):
    r = api(failing_test="test_upload", log_excerpt="boom ``` end", run_url="https://ci/run/1", commit_sha="abc1234").json()
    assert r["outcome"] == "filed" and r["issue_number"] == 41 and r["shadow"] is False
    f = w.filed[0]
    assert f.repo["full_name"] == "acme/widgets" and f.title == "upload retry timeout"
    assert f.labels == ["ci-failure", "prio-p1"]
    assert "https://ci/run/1" in f.body and "abc1234" in f.body and "test_upload" in f.body
    assert "````\nboom ``` end\n````" in f.body  # fence longer than any backtick run in the log
    assert w.upserts and w.upserts[0][2] == 41  # filed issue becomes a retrieval candidate
    row = db.fetch_one("SELECT * FROM ci_reports")
    assert (row["outcome"], row["filed_issue_number"], row["source"]) == ("filed", 41, "ci")
    assert db.fetch_one("SELECT kind, source FROM items WHERE id = %s", (row["item_id"],)) == {"kind": "ci_report", "source": "ci_agent"}
    assert sorted(w.outcomes.values()) == ["acted", "acted"] and len(r["decision_ids"]) == 2  # ci.kind + priority
    assert not w.queued


def test_github_failure_is_queued_not_lost(api, repo, w, monkeypatch):
    def boom(*a):
        raise RuntimeError("github 502")

    monkeypatch.setattr(actions, "file_issue", boom, raising=False)
    r = api().json()
    assert r["outcome"] == "queued" and "github 502" in r["reason"] and w.queued
    assert db.fetch_one("SELECT outcome FROM ci_reports")["outcome"] == "queued"


def test_filed_with_area_label(api, repo, w):
    w.cfg.areas = {"core": SimpleNamespace(description="engine")}
    api()
    assert w.filed[0].labels == ["ci-failure", "prio-p1", "area-core"]
    assert any(q.id == "route.area" and q.criteria == {"core": "engine"} for q in w.runs[0][1])


def test_merged_into_existing_issue(api, repo, w):
    cand = seed_issue(repo, 12, "upload retry timeout hangs")
    w.script["ci.same_as"] = ("true", 0.97)
    r = api().json()
    assert (r["outcome"], r["merged_into"], r["issue_number"]) == ("merged", 12, None)
    assert not w.filed and not w.comments  # silent by default
    qs = {q.id: q for q in w.runs[0][1]}
    assert f"ci.same_as#{cand['id']}" in qs
    assert qs[f"ci.same_as#{cand['id']}"].instructions["candidate"].startswith("#12 upload retry timeout hangs")
    c = db.fetch_one("SELECT * FROM ci_candidates")
    assert c["candidate_item_id"] == cand["id"] and c["same_as_probability"] == pytest.approx(0.97) and c["retrieval_score"] > 0
    assert db.fetch_one("SELECT merged_into_number FROM ci_reports")["merged_into_number"] == 12

    w.cfg.comments = True
    api()
    assert len(w.comments) == 1 and w.comments[0][0]["github_number"] == 12 and w.comments[0][2] == "ci_occurrence"


def test_possible_duplicate_is_queued_not_filed(api, repo, w):
    seed_issue(repo, 12, "upload retry timeout hangs")
    w.script["ci.same_as"] = ("true", 0.6)
    r = api().json()
    assert r["outcome"] == "queued" and "possible duplicate of #12" in r["reason"] and not w.filed
    assert w.queued == [("ci_gate", r["reason"], "review")]


def test_flaky_counts_occurrences(api, repo, w):
    w.script["ci.kind"] = ("flaky_test", 0.95)
    assert api(failing_test="test_a", run_url="https://ci/1").json()["outcome"] == "flaky"
    api(failing_test="test_a", run_url="https://ci/2")
    row = db.fetch_one("SELECT * FROM flaky_tests")
    assert (row["test_id"], row["occurrences"], row["last_run_url"]) == ("test_a", 2, "https://ci/2")
    assert not w.filed


def test_infra_notifies(api, repo, w):
    w.script["ci.kind"] = ("infrastructure", 0.95)
    assert api(run_url="https://ci/9").json()["outcome"] == "infra"
    assert len(w.notified) == 1 and w.notified[0][0] == "https://hooks.example/x" and "https://ci/9" in w.notified[0][1]
    assert not w.filed and not w.queued


def test_low_confidence_is_queued(api, repo, w):
    w.script["ci.kind"] = ("code_bug", 0.5)
    r = api().json()
    assert r["outcome"] == "queued" and r["shadow"] is False and not w.filed
    assert w.queued[0][2] == "review" and set(w.outcomes.values()) == {"queued"}


def test_rate_limited_files_then_queues(api, repo, w):
    w.cfg.ci_gate.max_issues_per_hour = 1
    assert api().json()["outcome"] == "filed"
    r = api().json()
    assert r["outcome"] == "rate_limited" and r["issue_number"] is None and len(w.filed) == 1
    assert w.queued and w.queued[0][2] == "review"
    assert db.fetch_one("SELECT outcome FROM ci_reports ORDER BY id DESC LIMIT 1")["outcome"] == "rate_limited"


def test_shadow_never_acts(api, repo, w):
    w.cfg.modes["ci_gate"] = "shadow"
    r = api().json()
    assert (r["outcome"], r["shadow"]) == ("queued", True) and r["reason"] == "shadow: would be filed"
    assert not w.filed and not w.upserts and w.queued
    assert set(w.outcomes.values()) == {"shadow"} and len(w.outcomes) == len(r["decision_ids"]) == 2
    w.script["ci.kind"] = ("flaky_test", 0.95)
    assert api(failing_test="t").json()["reason"] == "shadow: would be flaky"
    assert db.fetch_one("SELECT count(*) AS n FROM flaky_tests")["n"] == 0


def test_not_eligible_is_queued(api, repo, w, monkeypatch):
    # auto mode but the question is unmeasured: decide() says queue
    monkeypatch.setattr(pipeline, "decide", lambda ctx, v: "queue", raising=False)
    r = api().json()
    assert r["outcome"] == "queued" and r["reason"] == "not eligible: would be filed" and r["shadow"] is False


def test_mode_off_skips_everything(api, repo, w):
    w.cfg.modes["ci_gate"] = "off"
    r = api().json()
    assert (r["outcome"], r["reason"], r["decision_ids"]) == ("queued", "disabled", []) and not w.runs and not w.queued


def test_backend_error_is_queued(api, repo, w):
    w.error = "jev down"
    r = api().json()
    assert r["outcome"] == "queued" and "jev down" in r["reason"] and not w.filed and w.queued


def test_external_security_claim_is_held(api, repo, w):
    w.script["gate.security_claim"] = ("true", 0.95)
    r = api(source="external").json()
    assert r["outcome"] == "held" and r["issue_number"] is None and not w.filed
    assert w.queued == [("inbound_gate", "gate.security_claim=true", "held")]
    assert len(w.notified) == 1
    assert {q.id for q in w.runs[0][1]} == set(ci_gate.EXTERNAL_QUESTIONS)  # gate.* only, no same_as
    assert "## Repository facts" in w.runs[0][0] and "src/app.py" in w.runs[0][0]
    row = db.fetch_one("SELECT r.source, i.kind, i.source AS isrc FROM ci_reports r JOIN items i ON i.id = r.item_id")
    assert row == {"source": "external", "kind": "report", "isrc": "external"}


def test_external_ungrounded_held_and_clean_queued(api, repo, w):
    w.script["gate.grounded"] = ("false", 0.95)
    assert api(source="external").json()["outcome"] == "held"
    w.script["gate.grounded"] = ("true", 0.95)
    r = api(source="external").json()
    assert r["outcome"] == "queued" and w.queued[-1][2] == "review" and not w.filed


def test_external_shadow_is_queued_with_shadow_flag(api, repo, w):
    w.cfg.modes["inbound_gate"] = "shadow"
    w.script["gate.known_non_issue"] = ("true", 0.95)
    r = api(source="external").json()
    assert (r["outcome"], r["shadow"], r["reason"]) == ("queued", True, "shadow: would be held") and not w.notified


# ---- retrieval ----------------------------------------------------------------------------------

def test_words():
    ws = retrieval.words("The parser crashes! parser CRASHES when reading empty-file; this is a bug in v2")
    assert ws == ["parser", "crashes", "reading", "empty", "file"]
    assert len(retrieval.words(" ".join(f"word{i}" for i in range(100)))) == 30


def test_similar_ranks_filters_and_excludes(repo, org, w):
    best = seed_issue(repo, 1, "parser crashes on empty file input")
    ok = seed_issue(repo, 2, "parser slow on large file")
    seed_issue(repo, 3, "docs typo in readme")
    seed_issue(repo, 4, "parser crashes on empty file", state="closed")
    seed_issue(repo, 5, "parser crashes on empty file", kind="pr")
    other = db.fetch_one("INSERT INTO repos (org_id, github_repo_id, full_name) VALUES (%s, 9, 'acme/other') RETURNING id", (org["id"],))
    db.execute("INSERT INTO items (repo_id, kind, github_number, title, source) VALUES (%s, 'issue', 1, 'parser crashes on empty file', 'webhook')", (other["id"],))

    got = retrieval.similar(repo["id"], "parser crashes on empty file")
    assert [r["github_number"] for r in got] == [1, 2]
    assert got[0]["score"] > got[1]["score"] > 0 and got[0]["id"] == best["id"] and ok["id"] == got[1]["id"]
    assert "search" not in got[0]
    assert [r["github_number"] for r in retrieval.similar(repo["id"], "parser crashes on empty file", exclude_item_id=best["id"])] == [2]
    assert [r["github_number"] for r in retrieval.similar(repo["id"], "parser crashes on empty file", k=1)] == [1]
    assert {r["github_number"] for r in retrieval.similar(repo["id"], "parser crashes on empty file", open_only=False)} == {1, 2, 4}
    assert [r["github_number"] for r in retrieval.similar(repo["id"], "parser crashes", kinds=("pr",))] == [5]
    assert retrieval.similar(repo["id"], "the and for") == []


def test_similar_unions_github_hits(repo, w, monkeypatch):
    seed_issue(repo, 1, "parser crashes on empty file")
    FakeGitHub.hits = [
        {"number": 1, "title": "parser crashes on empty file", "body": "", "state": "open"},  # already local: not re-upserted
        {"number": 77, "title": "empty file makes parser crash", "body": "stack trace", "user": {"login": "bob"},
         "author_association": "NONE", "html_url": "https://github.com/acme/widgets/issues/77", "state": "open",
         "created_at": "2025-01-01T00:00:00Z"}]
    upserted = []

    def upsert(repo_row, kind, number, title, body, author, assoc, url, source, state="open", created_at=None, extra=None):
        upserted.append((number, source))
        return db.fetch_one("""INSERT INTO items (repo_id, kind, github_number, title, body, author, source, state)
                               VALUES (%s, %s, %s, %s, %s, %s, %s, %s) RETURNING id""",
                            (repo_row["id"], kind, number, title, body, author, source, state))

    monkeypatch.setattr(pipeline, "upsert_item", upsert, raising=False)
    got = retrieval.similar(repo["id"], "parser crashes empty file")
    assert upserted == [(77, "backfill")]
    assert sorted(r["github_number"] for r in got) == [1, 77] and all(r["id"] for r in got)
    assert FakeGitHub.queries[0].startswith("repo:acme/widgets is:issue is:open parser crashes empty file")


def test_similar_survives_github_failure(repo, w, monkeypatch):
    seed_issue(repo, 1, "parser crashes on empty file")

    def boom(q, max_items=10):
        raise RuntimeError("github down")

    monkeypatch.setattr(w.gh, "search_issues", boom)
    assert [r["github_number"] for r in retrieval.similar(repo["id"], "parser crashes")] == [1]
