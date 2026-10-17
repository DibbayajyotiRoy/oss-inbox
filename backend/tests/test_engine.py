import hashlib
import sys
import types
from types import SimpleNamespace

import pytest

from app import db, decision, engine
from app.decision import Answer, DecisionError, DecisionResult
from app.questions import spec


class Backend:
    def __init__(self, answers=None, error=None):
        self.answers, self.error, self.calls = answers or [], error, []

    def decide(self, state, questions, model=None):
        self.calls.append((state, questions, model))
        if self.error:
            raise DecisionError(self.error)
        return DecisionResult("jev-test", "jev", {a.question_id: a for a in self.answers},
                              latency_ms=12, tokens_in=500, cost_usd=0.00002, calibrated=True)


def config(mode="auto", thresholds=None, require=False, min_samples=30, model=None):
    return SimpleNamespace(model=model, thresholds=thresholds or {}, mode=lambda feature: mode,
                           evaluation=SimpleNamespace(require_evaluation=require, min_samples=min_samples))


def stats(monkeypatch, n, accuracy):
    seen = []
    mod = types.ModuleType("app.metrics")
    mod.question_stats = lambda repo_id, qid: seen.append((repo_id, qid)) or SimpleNamespace(n=n, accuracy=accuracy)
    monkeypatch.setitem(sys.modules, "app.metrics", mod)
    return seen


@pytest.fixture
def item(repo):
    return db.fetch_one("INSERT INTO items (repo_id, kind, github_number, title, source) "
                        "VALUES (%s,'issue',1,'t','webhook') RETURNING *", (repo["id"],))


def go(monkeypatch, item, repo, backend, cfg, qids=("issue.type",)):
    monkeypatch.setattr(decision, "get_backend", lambda: backend)
    qs = [spec(q) for q in qids]
    return engine.run(item, repo, cfg, "webhook", "## Title\nhi", qs)


def bug(conf=0.9):
    return Answer("issue.type", "bug", {"bug": conf, "feature": 1 - conf}, conf)


def test_run_persists_run_and_decisions(monkeypatch, item, repo):
    same = Answer("gate.same_as#7", "true", {"true": 0.95, "false": 0.05}, 0.95)
    backend = Backend([bug(0.9), same])
    run_id, verdicts, err = go(monkeypatch, item, repo, backend, config(thresholds={"issue.type": 0.95}, model="jev-x"),
                               qids=("issue.type", "gate.same_as"))
    assert err is None and set(verdicts) == {"issue.type", "gate.same_as#7"}
    assert backend.calls[0][2] == "jev-x" and len(backend.calls) == 1

    run = db.fetch_one("SELECT * FROM decision_runs WHERE id = %s", (run_id,))
    assert (run["item_id"], run["trigger"], run["backend"], run["model_version"]) == (item["id"], "webhook", "jev", "jev-test")
    assert run["state_hash"] == hashlib.sha256(b"## Title\nhi").hexdigest() and run["state_text"] == "## Title\nhi"
    assert (run["latency_ms"], run["tokens_in"], run["error"], run["calibrated"]) == (12, 500, None, True)

    rows = {r["question_id"]: r for r in db.fetch_all("SELECT * FROM decisions WHERE run_id = %s", (run_id,))}
    t = rows["issue.type"]
    assert (t["base_question"], t["answer"], t["outcome"], t["repo_id"], t["item_id"]) == \
           ("issue.type", "bug", "pending", repo["id"], item["id"])
    assert t["probabilities"] == {"bug": 0.9, "feature": pytest.approx(0.1)} and t["threshold_at_time"] == pytest.approx(0.95)
    assert rows["gate.same_as#7"]["base_question"] == "gate.same_as"
    assert rows["gate.same_as#7"]["threshold_at_time"] == pytest.approx(0.90)  # default
    v = verdicts["issue.type"]
    assert (v.decision_id, v.answer, v.confidence, v.threshold) == (t["id"], "bug", 0.9, 0.95)
    assert v.above is False and v.eligible is False


def test_model_defaults_to_none(monkeypatch, item, repo):
    backend = Backend([bug()])
    go(monkeypatch, item, repo, backend, config(model=""))
    assert backend.calls[0][2] is None


@pytest.mark.parametrize("mode,conf,above,eligible", [
    ("auto", 0.90, True, True),
    ("auto", 0.85, True, True),   # equal to threshold counts
    ("auto", 0.80, False, False),
    ("shadow", 0.99, True, False),
    ("off", 0.99, True, False),
])
def test_eligibility_by_mode_and_threshold(monkeypatch, item, repo, mode, conf, above, eligible):
    _, verdicts, _ = go(monkeypatch, item, repo, Backend([bug(conf)]), config(mode=mode))
    v = verdicts["issue.type"]
    assert (v.above, v.eligible) == (above, eligible)


@pytest.mark.parametrize("n,acc,eligible", [
    (30, 0.90, True),
    (30, 0.85, True),
    (29, 0.99, False),   # not enough samples
    (30, 0.80, False),   # measured but below threshold
    (0, None, False),    # unmeasured
])
def test_require_evaluation(monkeypatch, item, repo, n, acc, eligible):
    seen = stats(monkeypatch, n, acc)
    _, verdicts, _ = go(monkeypatch, item, repo, Backend([bug(0.9)]), config(require=True))
    assert verdicts["issue.type"].eligible is eligible
    assert seen == [(repo["id"], "issue.type")]


def test_stats_only_consulted_when_auto_and_above(monkeypatch, item, repo):
    seen = stats(monkeypatch, 100, 1.0)
    go(monkeypatch, item, repo, Backend([bug(0.5)]), config(require=True))
    go(monkeypatch, item, repo, Backend([bug(0.99)]), config(require=True, mode="shadow"))
    assert seen == []


def test_evaluation_uses_base_question_for_candidates(monkeypatch, item, repo):
    seen = stats(monkeypatch, 100, 1.0)
    same = Answer("gate.same_as#7", "true", {"true": 0.95, "false": 0.05}, 0.95)
    _, verdicts, _ = go(monkeypatch, item, repo, Backend([same]), config(require=True), qids=("gate.same_as",))
    assert verdicts["gate.same_as#7"].eligible and seen == [(repo["id"], "gate.same_as")]


def test_decision_error_records_run(monkeypatch, item, repo):
    run_id, verdicts, err = go(monkeypatch, item, repo, Backend(error="boom"), config())
    assert verdicts == {} and err == "boom"
    run = db.fetch_one("SELECT * FROM decision_runs WHERE id = %s", (run_id,))
    assert run["error"] == "boom" and run["state_text"] == "## Title\nhi" and run["item_id"] == item["id"]
    assert db.fetch_one("SELECT count(*) AS n FROM decisions")["n"] == 0


def test_set_outcome(monkeypatch, item, repo):
    _, verdicts, _ = go(monkeypatch, item, repo, Backend([bug()]), config())
    did = verdicts["issue.type"].decision_id
    engine.set_outcome(did, "queued")
    assert db.fetch_one("SELECT outcome FROM decisions WHERE id = %s", (did,))["outcome"] == "queued"
