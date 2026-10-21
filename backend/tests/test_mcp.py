"""MCP agent interface: token management, scope, demo access and every tool's output shape, over raw JSON-RPC on /api/mcp."""
import hashlib

import pytest
from fastapi.testclient import TestClient
from psycopg.types.json import Jsonb

from app import auth, db, ratelimit
from app.api import reports
from app.main import app
from app.repo_config import RepoConfig
from app.settings import settings
from test_dashboard_api import USER, enqueue, make_decision, make_item, make_run, make_truth, triaged

HEADERS = {"Accept": "application/json, text/event-stream"}
TOOLS = {"list_repos", "list_queue", "get_item", "get_accuracy", "preview_threshold", "resolve_item", "submit_report"}
WATCHED = ["queue_items", "ground_truth", "overrides", "actions", "audit_log", "ci_reports", "items", "decisions", "decision_runs"]


@pytest.fixture
def repo(repo):
    db.execute("UPDATE repos SET config = %s WHERE id = %s", (Jsonb(RepoConfig().model_dump(mode="json")), repo["id"]))
    return repo


@pytest.fixture
def box(monkeypatch):
    """Role of the signed-in human (token management); agents keep the real auth.role."""
    state, real = {"role": "admin"}, auth.role
    monkeypatch.setattr(auth, "role", lambda u, r: real(u, r) if hasattr(u, "agent_repo_ids") else state["role"])
    return state


@pytest.fixture
def web(box, monkeypatch):
    monkeypatch.setitem(app.dependency_overrides, auth.current_user, lambda: USER)
    return TestClient(app)


def mint(web, repo, scopes=("read",), name="bot") -> str:
    r = web.post(f"/api/repos/{repo['id']}/agent-tokens", json={"name": name, "scopes": list(scopes)})
    assert r.status_code == 200, r.text
    return r.json()["token"]


def rpc(web, token, method, params=None):
    h = {**HEADERS, **({"Authorization": f"Bearer {token}"} if token else {})}
    return web.post("/api/mcp", headers=h, json={"jsonrpc": "2.0", "id": 1, "method": method, "params": params or {}})


def call(web, token, name, **args):
    """(is_error, structured content or error text)"""
    r = rpc(web, token, "tools/call", {"name": name, "arguments": args})
    assert r.status_code == 200, r.text
    res = r.json()["result"]
    return res["isError"], (res["content"][0]["text"] if res["isError"] else res["structuredContent"])


def counts():
    return {t: db.fetch_one(f"SELECT count(*) AS n FROM {t}")["n"] for t in WATCHED}


# --- tokens ------------------------------------------------------------------------------------

def test_token_lifecycle(web, box, repo):
    r = web.post(f"/api/repos/{repo['id']}/agent-tokens", json={"name": "triage-bot", "scopes": ["write"]})
    body = r.json()
    assert body["token"].startswith("oi_") and body["name"] == "triage-bot"
    assert body["scopes"] == ["read", "write"]  # write implies read
    row = db.fetch_one("SELECT * FROM agent_tokens WHERE id = %s", (body["id"],))
    assert row["token_hash"] == hashlib.sha256(body["token"].encode()).hexdigest() and body["token"] not in str(row)
    listed = web.get(f"/api/repos/{repo['id']}/agent-tokens").json()["items"]
    assert [(t["id"], t["name"], t["scopes"], t["revoked_at"]) for t in listed] == [(body["id"], "triage-bot", ["read", "write"], None)]
    assert "token" not in listed[0] and "token_hash" not in listed[0]

    assert call(web, body["token"], "list_repos")[0] is False
    assert db.fetch_one("SELECT last_used_at FROM agent_tokens")["last_used_at"] is not None

    assert web.delete(f"/api/repos/{repo['id']}/agent-tokens/{body['id']}").json() == {"ok": True}
    assert rpc(web, body["token"], "tools/list").status_code == 401  # revoked
    assert web.delete(f"/api/repos/{repo['id']}/agent-tokens/{body['id']}").status_code == 404
    assert [(a["action"], a["actor"], a["target"]) for a in db.fetch_all("SELECT * FROM audit_log ORDER BY id")] == [
        ("agent_token.create", "maint", "triage-bot"), ("agent_token.revoke", "maint", "triage-bot")]


def test_default_scope_is_read_and_bad_input_is_rejected(web, repo):
    assert web.post(f"/api/repos/{repo['id']}/agent-tokens", json={"name": "r"}).json()["scopes"] == ["read"]
    for bad in ({"name": ""}, {"name": "x", "scopes": []}, {"name": "x", "scopes": ["admin"]}):
        assert web.post(f"/api/repos/{repo['id']}/agent-tokens", json=bad).status_code == 422


@pytest.mark.parametrize("role", ["viewer", "maintainer"])
def test_only_admins_manage_tokens(web, box, repo, role):
    box["role"] = role
    assert web.get(f"/api/repos/{repo['id']}/agent-tokens").status_code == 403
    assert web.post(f"/api/repos/{repo['id']}/agent-tokens", json={"name": "x"}).status_code == 403
    assert web.delete(f"/api/repos/{repo['id']}/agent-tokens/1").status_code == 403


def test_unauthenticated_calls_are_401(web, repo):
    token = mint(web, repo)
    for t in (None, "", "oi_nope", "jt_" + token[3:], token + "x"):
        r = rpc(web, t, "tools/list")
        assert r.status_code == 401 and r.headers["www-authenticate"].startswith("Bearer")
    assert web.get("/api/mcp", headers={"Authorization": f"Bearer {token}"}).status_code == 405  # stateless: no SSE stream


def test_rate_limit_per_token(web, repo, monkeypatch):
    token = mint(web, repo)
    seen = []
    monkeypatch.setattr(ratelimit, "allow", lambda key, limit, window: seen.append((key, limit, window)) or False)
    r = rpc(web, token, "tools/list")
    assert r.status_code == 429 and r.headers["retry-after"] == "60"
    assert seen == [(f"mcp:token:{db.fetch_one('SELECT id FROM agent_tokens')['id']}", 120, 60)]


# --- scope -------------------------------------------------------------------------------------

def test_tools_list(web, repo):
    r = rpc(web, mint(web, repo), "tools/list").json()["result"]["tools"]
    assert {t["name"] for t in r} == TOOLS
    assert {t["name"] for t in r if t["annotations"]["readOnlyHint"]} == TOOLS - {"resolve_item", "submit_report"}
    assert all(t["description"] and t["outputSchema"] for t in r)
    assert next(t for t in r if t["name"] == "list_queue")["inputSchema"]["properties"]["limit"]["maximum"] == 50


def test_read_token_cannot_write(web, repo):
    item, *_, qid = triaged(repo)
    token = mint(web, repo, ["read"])
    before = counts()
    err, text = call(web, token, "resolve_item", queue_id=qid, action="accept")
    assert err and "read-only" in text
    err, text = call(web, token, "submit_report", repo="acme/widgets", title="boom")
    assert err and "read-only" in text
    assert counts() == before
    assert db.fetch_one("SELECT status FROM queue_items")["status"] == "open"


def test_token_is_limited_to_its_repo(web, repo, org):
    other = db.fetch_one("INSERT INTO repos (org_id, github_repo_id, full_name, enabled) VALUES (%s, 2002, 'acme/other', true) RETURNING *",
                         (org["id"],))
    foreign, *_, foreign_q = triaged(other, 7)
    token = mint(web, repo, ["write"])
    before = counts()
    assert "Unknown repository" in call(web, token, "list_queue", repo="acme/other")[1]
    assert "Unknown repository" in call(web, token, "get_accuracy", repo="acme/other")[1]
    assert "Not available" in call(web, token, "get_item", item_id=foreign["id"])[1]
    assert "Not available" in call(web, token, "resolve_item", queue_id=foreign_q, action="dismiss")[1]
    assert "Unknown repository" in call(web, token, "submit_report", repo="acme/other", title="x")[1]
    assert counts() == before
    assert [r["repo"] for r in call(web, token, "list_repos")[1]["repos"]] == ["acme/widgets"]


# --- demo mode ---------------------------------------------------------------------------------

def test_demo_visitors_read_demo_org_only(web, repo, org, monkeypatch):
    demo = db.fetch_one("INSERT INTO orgs (github_installation_id, login) VALUES (9, 'demo-org') RETURNING *")
    d = db.fetch_one("INSERT INTO repos (org_id, github_repo_id, full_name, enabled, config) VALUES (%s, 9001, 'demo-org/api', true, %s) RETURNING *",
                     (demo["id"], Jsonb(RepoConfig().model_dump(mode="json"))))
    _, _, _, qid = triaged(d, 3)
    triaged(repo, 4)
    assert rpc(web, None, "tools/list").status_code == 401  # a real deployment never serves anonymous callers
    monkeypatch.setattr(settings, "demo_mode", True)

    assert [r["repo"] for r in call(web, None, "list_repos")[1]["repos"]] == ["demo-org/api"]
    assert call(web, None, "list_repos")[1]["can_write"] is False
    assert len(call(web, None, "list_queue", repo="demo-org/api")[1]["entries"]) == 1
    assert "Unknown repository" in call(web, None, "list_queue", repo="acme/widgets")[1]
    before = counts()
    assert "read-only" in call(web, None, "resolve_item", queue_id=qid, action="accept")[1]
    assert "read-only" in call(web, None, "submit_report", repo="demo-org/api", title="x")[1]
    assert counts() == before
    assert rpc(web, "oi_bad", "tools/list").status_code == 401  # a bad token is not silently anonymous


# --- read tools --------------------------------------------------------------------------------

def seed(repo):
    """Two review entries, one held report, and 12 checked `issue.type` answers (10 sure and right, 2 unsure and wrong)."""
    item, d_type, d_prio, qid = triaged(repo, 1)
    triaged(repo, 2)
    report = make_item(repo, kind="report", title="Possible RCE in the parser")
    run = make_run(report)
    sec = make_decision(run, "gate.security_claim", "true", {"true": 0.97, "false": 0.03}, 0.97, outcome="queued", threshold=0.9)
    held_q = enqueue(report, "held", "inbound_gate")
    for i in range(12):
        it = make_item(repo, 100 + i)
        good = i < 10
        make_decision(make_run(it), "issue.type", "bug", {"bug": 0.9 if good else 0.6, "feature": 0.1 if good else 0.4}, 0.9 if good else 0.6)
        make_truth(it, "issue.type", "bug" if good else "feature")
    return item, d_type, d_prio, qid, report, sec, held_q


def test_list_repos(web, repo):
    seed(repo)
    err, out = call(web, mint(web, repo), "list_repos")
    assert not err and out["can_write"] is False
    (r,) = out["repos"]
    assert (r["repo"], r["enabled"], r["waiting_for_review"], r["held"]) == ("acme/widgets", True, 2, 1)
    assert r["features"]["issue_triage"] == "learning" and r["features"]["spam"] == "off"
    assert set(r) == {"repo", "enabled", "waiting_for_review", "held", "items_30d", "accuracy", "features"}


def test_list_queue_review_held_and_paging(web, repo):
    _, d_type, d_prio, qid, report, sec, held_q = seed(repo)
    token = mint(web, repo)
    err, out = call(web, token, "list_queue", repo="ACME/Widgets")
    assert not err and out["bucket"] == "review" and [e["number"] for e in out["entries"]] == [1, 2]
    e = out["entries"][0]
    assert (e["queue_id"], e["why"], e["kind"], e["title"]) == (qid, "low confidence", "issue", "Issue 1")
    assert {"item_id", "url", "author", "waiting_hours"} <= set(e)
    prio = next(s for s in e["suggestions"] if s["question_id"] == "priority")
    assert (prio["question"], prio["answer"], prio["answer_text"]) == ("How urgent?", "p1", "Priority: high (p1)")
    assert (prio["how_sure"], prio["acts_on_its_own_at"], prio["decision_id"]) == (0.6, 0.9, d_prio["id"])
    assert [a["answer"] for a in prio["answers"]] == ["p1", "p2", "p0", "p3"]  # most likely first
    assert prio["answers"][0] == {"answer": "p1", "text": "Priority: high (p1)", "probability": 0.6}

    err, out = call(web, token, "list_queue", repo="acme/widgets", limit=1)
    assert [e["number"] for e in out["entries"]] == [1] and out["next_after_queue_id"] == qid
    err, out = call(web, token, "list_queue", repo="acme/widgets", limit=1, after_queue_id=out["next_after_queue_id"])
    assert [e["number"] for e in out["entries"]] == [2] and out["next_after_queue_id"] is None

    err, out = call(web, token, "list_queue", repo="acme/widgets", bucket="held")
    (h,) = out["entries"]
    assert (h["queue_id"], h["kind"], h["number"]) == (held_q, "report", None)
    assert h["suggestions"][0]["answer_text"] == "Claims a security issue"

    assert call(web, token, "list_queue", repo="acme/widgets", limit=51)[0] is True  # limit <= 50
    assert call(web, token, "list_queue", repo="acme/widgets", bucket="nope")[0] is True


def test_get_item_explains_why_held(web, repo):
    item, d_type, d_prio, qid, report, sec, held_q = seed(repo)
    db.execute("INSERT INTO overrides (decision_id, user_login, new_answer) VALUES (%s, 'maint', 'feature')", (d_type["id"],))
    token = mint(web, repo)

    err, out = call(web, token, "get_item", item_id=report["id"])
    assert not err and out["repo"] == "acme/widgets" and out["kind"] == "report"
    assert out["queue"] == {"queue_id": held_q, "bucket": "held", "status": "open", "reason": "low confidence"}
    assert out["why_held"] == ("Held back from the public tracker for a maintainer. Reason: low confidence. "
                               "Signals: Claims a security issue (97% sure).")
    (d,) = out["latest_decisions"]
    assert (d["question"], d["answer"], d["outcome"], d["outcome_text"]) == ("Claims a security problem?", "true", "queued", "Waiting for you")
    assert (d["how_sure"], d["acts_on_its_own_at"]) == (0.97, 0.9)
    assert d["answers"] == [{"answer": "true", "text": "Claims a security issue", "probability": 0.97},
                            {"answer": "false", "text": "No security claim", "probability": 0.03}]

    err, out = call(web, token, "get_item", item_id=item["id"])
    assert out["why_held"].startswith("Waiting for a maintainer to review") and "Signals" not in out["why_held"]
    assert {d["question_id"]: d["outcome_text"] for d in out["latest_decisions"]} == {"issue.type": "Learning only", "priority": "Waiting for you"}
    assert out["maintainer_changes"][0]["new_answer"] == "feature" and out["actions_taken"] == []
    assert out["body"] == "body" and out["body_truncated"] is False and "state_text" not in str(out)
    assert call(web, token, "get_item", item_id=99999)[0] is True


def test_get_item_without_open_queue_entry_has_no_why_held(web, repo):
    item, *_, qid = triaged(repo)
    db.execute("UPDATE queue_items SET status = 'dismissed'")
    out = call(web, mint(web, repo), "get_item", item_id=item["id"])[1]
    assert out["why_held"] is None and out["queue"]["status"] == "dismissed"


def test_get_accuracy(web, repo):
    seed(repo)
    err, out = call(web, mint(web, repo), "get_accuracy", repo="acme/widgets")
    assert not err and "upper bound" in out["caveat"]
    qs = {q["question_id"]: q for q in out["questions"]}
    t = qs["issue.type"]
    assert (t["answers_checked"], t["acts_on_its_own_at"], t["recommended_threshold"], t["ready_to_act"]) == (12, 0.85, 0.61, False)
    assert t["accuracy"] == pytest.approx(10 / 12) and t["calibration_error"] is not None
    assert t["summary"] == "Right 83% of the time, out of 12 answers." and t["feature"] == "issue_triage"
    assert qs["spam"]["answers_checked"] == 0 and qs["spam"]["accuracy"] is None and qs["spam"]["summary"] == "No answers checked yet."
    assert out["questions"][0]["question_id"] == "issue.type"  # measured questions first


def test_preview_threshold_counts(web, repo):
    seed(repo)
    token = mint(web, repo)
    out = call(web, token, "preview_threshold", repo="acme/widgets", question_id="issue.type", threshold=0.8)[1]
    assert (out["answers_checked"], out["auto_acted"], out["queued"], out["would_be_wrong"], out["not_yet_checked"]) == (14, 10, 4, 0, 0)  # + the 2 unchecked items from triaged()
    assert out["current_threshold"] == 0.85 and out["question"] == "What kind of issue?" and "10 of 14" in out["summary"]
    out = call(web, token, "preview_threshold", repo="acme/widgets", question_id="issue.type", threshold=0.5)[1]
    assert (out["auto_acted"], out["queued"], out["would_be_wrong"], out["not_yet_checked"]) == (14, 0, 2, 2)
    for bad in ({"question_id": "nope", "threshold": 0.8}, {"question_id": "issue.type", "threshold": 0.2}, {"question_id": "issue.type", "threshold": 1.5}):
        assert call(web, token, "preview_threshold", repo="acme/widgets", **bad)[0] is True


def test_read_tools_never_mutate(web, repo):
    item, *_ = seed(repo)
    token = mint(web, repo, ["read"])
    before = counts()
    for name, args in (("list_repos", {}), ("list_queue", {"repo": "acme/widgets"}), ("list_queue", {"repo": "acme/widgets", "bucket": "held"}),
                       ("get_item", {"item_id": item["id"]}), ("get_accuracy", {"repo": "acme/widgets"}),
                       ("preview_threshold", {"repo": "acme/widgets", "question_id": "priority", "threshold": 0.9})):
        assert call(web, token, name, **args)[0] is False, name
    assert counts() == before


# --- write tools -------------------------------------------------------------------------------

def test_resolve_accept_uses_the_dashboard_path(web, repo, monkeypatch):
    monkeypatch.setattr(settings, "dry_run", True)  # actions.label records, never calls GitHub
    item, d_type, d_prio, qid, *_ = seed(repo)
    token = mint(web, repo, ["write"], name="triage-bot")

    assert call(web, token, "resolve_item", queue_id=qid, action="accept", answers={str(d_type["id"]): "nonsense"})[0] is True
    assert db.fetch_one("SELECT status FROM queue_items WHERE id = %s", (qid,))["status"] == "open"

    err, out = call(web, token, "resolve_item", queue_id=qid, action="accept", answers={str(d_prio["id"]): "p0"})
    assert not err and out == {"ok": True, "queue_id": qid, "status": "accepted"}
    q = db.fetch_one("SELECT * FROM queue_items WHERE id = %s", (qid,))
    assert (q["status"], q["resolved_by"]) == ("accepted", "agent:triage-bot")
    truth = {r["question_id"]: r["answer"] for r in db.fetch_all("SELECT * FROM ground_truth WHERE item_id = %s", (item["id"],))}
    assert truth == {"issue.type": "bug", "priority": "p0"}
    (ov,) = db.fetch_all("SELECT * FROM overrides")
    assert (ov["decision_id"], ov["user_login"], ov["new_answer"]) == (d_prio["id"], "agent:triage-bot", "p0")
    assert {a["kind"] for a in db.fetch_all("SELECT * FROM actions WHERE item_id = %s", (item["id"],))} == {"label"}
    assert all(a["payload"]["dry_run"] for a in db.fetch_all("SELECT * FROM actions"))
    audit = db.fetch_one("SELECT * FROM audit_log WHERE action = 'queue.accept'")
    assert (audit["actor"], audit["target"]) == ("agent:triage-bot", str(qid))

    assert "already accepted" in call(web, token, "resolve_item", queue_id=qid, action="accept")[1]


def test_resolve_dismiss_and_release_rules(web, repo):
    *_, qid, report, sec, held_q = seed(repo)
    token = mint(web, repo, ["write"])
    assert "only held items" in call(web, token, "resolve_item", queue_id=qid, action="release")[1]
    assert call(web, token, "resolve_item", queue_id=qid, action="dismiss")[1]["status"] == "dismissed"
    assert db.fetch_one("SELECT count(*) AS n FROM ground_truth WHERE item_id = (SELECT item_id FROM queue_items WHERE id = %s)", (qid,))["n"] == 0
    assert call(web, token, "resolve_item", queue_id=qid, action="shred")[0] is True


def test_submit_report_goes_through_the_reports_path(web, repo, monkeypatch):
    monkeypatch.setattr(reports.ci_gate, "process_report", lambda rid: {
        "report_id": rid, "outcome": "held", "reason": "gate.security_claim=true", "issue_number": None, "merged_into": None,
        "decision_ids": [], "shadow": True})
    token = mint(web, repo, ["write"], name="scanner")
    err, out = call(web, token, "submit_report", repo="acme/widgets", title="Crash in parser", body="stack", run_url="https://ci/1")
    assert not err and out == {"report_id": 1, "outcome": "held", "outcome_text": "Held for a maintainer (never filed publicly)",
                               "reason": "gate.security_claim=true", "issue_number": None, "merged_into": None, "learning_mode": True}
    rep = db.fetch_one("SELECT * FROM ci_reports")
    assert rep["source"] == "external" and rep["payload"]["title"] == "Crash in parser"  # external unless the agent says "ci"
    item = db.fetch_one("SELECT * FROM items WHERE id = %s", (rep["item_id"],))
    assert (item["kind"], item["source"], item["extra"]["run_url"]) == ("report", "external", "https://ci/1")
    audit = db.fetch_one("SELECT * FROM audit_log WHERE action = 'report.submit'")
    assert (audit["actor"], audit["details"]["report_id"], audit["details"]["outcome"]) == ("agent:scanner", 1, "held")

    assert call(web, token, "submit_report", repo="acme/widgets", title="ci one", source="ci")[0] is False
    assert db.fetch_one("SELECT source FROM ci_reports WHERE id = 2")["source"] == "ci"
    for bad in ({"title": ""}, {"title": "x", "commit_sha": "zzz"}, {"title": "x", "run_url": "javascript:alert(1)"}, {"title": "x" * 300}):
        assert call(web, token, "submit_report", repo="acme/widgets", **bad)[0] is True
    assert db.fetch_one("SELECT count(*) AS n FROM ci_reports")["n"] == 2


def test_submit_report_needs_an_enabled_repo(web, repo):
    token = mint(web, repo, ["write"])
    db.execute("UPDATE repos SET enabled = false")
    assert "not enabled" in call(web, token, "submit_report", repo="acme/widgets", title="x")[1]
    assert db.fetch_one("SELECT count(*) AS n FROM ci_reports")["n"] == 0


# --- plain language ----------------------------------------------------------------------------

def test_plain_language_matches_the_dashboard():
    from app.mcp_server import answer_text, question_text
    assert question_text("gate.same_as#12") == "Same as #12?" and question_text("pr.breaking") == "Breaking change?"
    assert answer_text("gate.same_as#12", "true") == "Same problem as #12"
    assert answer_text("ci.kind", "flaky_test") == "Flaky test (fails at random)"
    assert answer_text("route.area", "docs") == "Area: docs" and answer_text("unknown.q", "x") == "x"
    assert question_text("unknown.q") == "unknown.q"
