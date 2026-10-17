import hashlib
import sys
import types
from types import SimpleNamespace

import httpx
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from psycopg.types.json import Jsonb

import app as app_pkg
from app import audit, auth, db
from app.api import dashboard
from app.questions import QUESTIONS, base_id
from app.settings import settings

USER = auth.User(7, "maint", "http://a/m.png", "gho_t")


def stub(monkeypatch, name, **attrs):
    """Replace app.<name> (it may not exist yet, or may be the real thing) for lazy `from app import <name>`."""
    mod = types.ModuleType(f"app.{name}")
    mod.__dict__.update(attrs)
    monkeypatch.setitem(sys.modules, f"app.{name}", mod)
    monkeypatch.setattr(app_pkg, name, mod, raising=False)


class Cfg:
    thresholds = {"priority": 0.7}
    model = None
    evaluation = SimpleNamespace(min_samples=3)
    features = {"issue_triage": SimpleNamespace(mode="auto"), "spam": SimpleNamespace(mode="off")}

    def label(self, key, answer=None):
        return f"{key}={answer}" if answer else key

    def model_dump(self, mode="python"):
        return {"features": {"spam": {"mode": "off"}}, "comments": False}


def _parse_config(text):
    if "bad" in text:
        raise ValueError("invalid config: a.b: bad; c: worse")


@pytest.fixture
def box(monkeypatch):
    """Role the caller has: global default, or per full_name (None = no access)."""
    state = {"role": "admin", "repos": {}}
    monkeypatch.setattr(auth, "role", lambda u, r: state["repos"].get(r["full_name"], state["role"]))
    return state


@pytest.fixture
def client(box):
    api = FastAPI()
    api.include_router(auth.router)
    api.include_router(dashboard.router)
    api.dependency_overrides[auth.current_user] = lambda: USER
    return TestClient(api)


@pytest.fixture
def calls(monkeypatch):
    c = {"label": [], "unlabel": [], "process": [], "enqueue": []}
    gh = SimpleNamespace(list_labels=lambda full: ["bug", "feature"])
    stub(monkeypatch, "repo_config", load=lambda repo, refresh=False: Cfg(), parse_config=_parse_config,
         render_yaml=lambda d: "yaml:" + ",".join(d),
         edit_url=lambda full, branch, text, exists: f"https://gh/{full}/{branch}/{exists}")
    stub(monkeypatch, "actions",
         label=lambda item, repo, labels, decision_id: c["label"].append((item["id"], labels, decision_id)),
         unlabel=lambda item, repo, label, decision_id: c["unlabel"].append((item["id"], label, decision_id)))
    stub(monkeypatch, "pipeline",
         process=lambda repo, kind, payload, trigger, actions_enabled=True: c["process"].append((kind, payload, trigger)))
    stub(monkeypatch, "jobs", enqueue=lambda t, **p: c["enqueue"].append((t, p)))
    stub(monkeypatch, "install", ensure_labels=lambda repo: ["bug", "p1"])
    stub(monkeypatch, "github", client_for=lambda repo: gh)
    return c


def make_item(repo, number=1, kind="issue", **kw):
    return db.fetch_one(
        "INSERT INTO items (repo_id, kind, github_number, title, body, author, author_association, html_url, source) "
        "VALUES (%s, %s, %s, %s, 'body', 'alice', 'NONE', %s, 'webhook') RETURNING *",
        (repo["id"], kind, number if kind in ("issue", "pr") else None, kw.get("title", f"Issue {number}"),
         f"https://github.com/acme/widgets/issues/{number}"))


def make_run(item, error=None):
    return db.fetch_one(
        "INSERT INTO decision_runs (item_id, trigger, backend, model_version, state_hash, state_text, error) "
        "VALUES (%s, 'webhook', 'jev', 'jev-1.13.0', 'h', 'state', %s) RETURNING *", (item["id"], error))


def make_decision(run, qid, answer, probs, conf, outcome="shadow", threshold=0.85):
    return db.fetch_one(
        "INSERT INTO decisions (run_id, item_id, repo_id, question_id, base_question, answer, probabilities, confidence, "
        "threshold_at_time, outcome) SELECT %s, i.id, i.repo_id, %s, %s, %s, %s, %s, %s, %s FROM items i "
        "JOIN decision_runs r ON r.item_id = i.id WHERE r.id = %s RETURNING *",
        (run["id"], qid, base_id(qid), answer, Jsonb(probs), conf, threshold, outcome, run["id"]))


def make_truth(item, qid, answer):
    db.execute("INSERT INTO ground_truth (item_id, question_id, answer, source) VALUES (%s, %s, %s, 'backfill')",
               (item["id"], qid, answer))


def enqueue(item, bucket="review", feature="issue_triage"):
    return db.fetch_one("INSERT INTO queue_items (item_id, repo_id, feature, reason, bucket) VALUES (%s, %s, %s, 'low confidence', %s) "
                        "RETURNING id", (item["id"], item["repo_id"], feature, bucket))["id"]


def triaged(repo, number=1):
    """Item with one run: issue.type=bug (shadow) and priority=p1 (queued), queued for review."""
    item = make_item(repo, number)
    run = make_run(item)
    d_type = make_decision(run, "issue.type", "bug", {"bug": 0.7, "feature": 0.3}, 0.7)
    d_prio = make_decision(run, "priority", "p1", {"p0": 0.1, "p1": 0.6, "p2": 0.2, "p3": 0.1}, 0.6, outcome="queued", threshold=0.9)
    return item, d_type, d_prio, enqueue(item)


def rows(sql, *p):
    return db.fetch_all(sql, p)


# --- auth and plumbing -------------------------------------------------------------------------

def test_requires_login(repo):
    api = FastAPI()
    api.include_router(dashboard.router)
    c = TestClient(api)
    assert c.get("/api/me").status_code == 401
    assert c.get(f"/api/repos/{repo['id']}").status_code == 401


@pytest.mark.parametrize("method,path,body", [
    ("get", "/api/repos/9999", None),
    ("get", "/api/items/9999", None),
    ("post", "/api/queue/9999/resolve", {"action": "dismiss"}),
    ("post", "/api/decisions/9999/override", {"answer": "x"}),
])
def test_unknown_ids_are_404(client, calls, method, path, body):
    assert getattr(client, method)(path, **({"json": body} if body else {})).status_code == 404


@pytest.mark.parametrize("method,path,body", [
    ("patch", "/api/repos/{id}", {"enabled": True}),
    ("post", "/api/repos/{id}/backfill", None),
    ("post", "/api/repos/{id}/labels/sync", None),
    ("get", "/api/repos/{id}/queue", None),
    ("get", "/api/repos/{id}/ci-reports", None),
    ("get", "/api/repos/{id}/audit", None),
    ("get", "/api/repos/{id}/ci-tokens", None),
    ("post", "/api/repos/{id}/ci-tokens", {"name": "ci"}),
    ("delete", "/api/repos/{id}/ci-tokens/1", None),
])
def test_viewer_is_forbidden(client, calls, box, repo, method, path, body):
    box["role"] = "viewer"
    r = getattr(client, method)(path.format(id=repo["id"]), **({"json": body} if body else {}))
    assert r.status_code == 403


@pytest.mark.parametrize("method,path,body", [
    ("patch", "/api/repos/{id}", {"enabled": True}),
    ("get", "/api/repos/{id}/ci-tokens", None),
    ("post", "/api/repos/{id}/ci-tokens", {"name": "ci"}),
])
def test_maintainer_cannot_do_admin_things(client, box, repo, method, path, body):
    box["role"] = "maintainer"
    r = getattr(client, method)(path.format(id=repo["id"]), **({"json": body} if body else {}))
    assert r.status_code == 403


def test_me_lists_only_installed_orgs_and_caches(client, monkeypatch, org):
    db.execute("INSERT INTO orgs (github_installation_id, login) VALUES (2002, 'other')")
    seen = []

    def get(url, **kw):
        seen.append((url, kw["headers"]["Authorization"]))
        return httpx.Response(200, json={"installations": [{"id": 1001}]}, request=httpx.Request("GET", url))

    monkeypatch.setattr(httpx, "get", get)
    for _ in range(2):
        assert client.get("/api/me").json() == {"login": "maint", "avatar_url": "http://a/m.png",
                                                 "orgs": [{"id": org["id"], "login": "acme", "avatar_url": None}]}
    assert seen == [("https://api.github.com/user/installations", "Bearer gho_t")]


def test_me_expired_github_token_is_401(client, monkeypatch):
    monkeypatch.setattr(httpx, "get", lambda url, **kw: httpx.Response(401, request=httpx.Request("GET", url)))
    assert client.get("/api/me").status_code == 401


def test_overview_omits_repos_without_access(client, box, repo, org):
    db.execute("INSERT INTO repos (org_id, github_repo_id, full_name) VALUES (%s, 2002, 'acme/hidden')", (org["id"],))
    box["role"] = "maintainer"
    box["repos"]["acme/hidden"] = None
    body = client.get(f"/api/orgs/{org['id']}/overview").json()
    assert body["org"] == {"id": org["id"], "login": "acme"}
    assert [r["full_name"] for r in body["repos"]] == ["acme/widgets"]
    card = body["repos"][0]
    assert card["role"] == "maintainer" and len(card["trend"]) == 30
    assert {"id", "private", "enabled", "items_30d", "acted_share", "queued_open", "held_open", "accuracy", "override_rate"} <= card.keys()
    assert client.get("/api/orgs/9999/overview").status_code == 404


# --- repo detail and settings ------------------------------------------------------------------

def test_repo_detail(client, calls, box, repo, monkeypatch):
    box["role"] = "viewer"
    for n, truth in enumerate(["bug", "bug", "feature"], start=1):
        item = make_item(repo, n)
        make_decision(make_run(item), "issue.type", "bug", {"bug": 0.9, "feature": 0.1}, 0.9)
        make_truth(item, "issue.type", truth)
    body = client.get(f"/api/repos/{repo['id']}").json()
    assert (body["role"], body["backend"], body["model"], body["calibrated"]) == ("viewer", "jev", settings.jev_model, True)
    assert body["features"] == {"issue_triage": "auto", "spam": "off"}
    assert body["config_source"] == "default" and body["default_branch"] == "main" and body["backfill_status"] is None
    qs = {q["id"]: q for q in body["questions"]}
    assert set(qs) == set(QUESTIONS)
    assert qs["issue.type"]["n"] == 3 and qs["issue.type"]["measured"] is True
    assert qs["issue.type"]["accuracy"] == pytest.approx(2 / 3)
    assert (qs["priority"]["threshold"], qs["priority"]["default_threshold"]) == (0.7, 0.9)
    assert qs["priority"]["n"] == 0 and qs["priority"]["accuracy"] is None and qs["priority"]["measured"] is False
    assert qs["issue.type"]["type"] == "choice" and qs["issue.type"]["feature"] == "issue_triage"

    monkeypatch.setattr(settings, "decision_backend", "anthropic")
    body = client.get(f"/api/repos/{repo['id']}").json()
    assert (body["backend"], body["model"], body["calibrated"]) == ("anthropic", settings.anthropic_model, False)


def test_patch_private_repo_needs_acknowledgement(client, calls, repo):
    db.execute("UPDATE repos SET private = true, enabled = false WHERE id = %s", (repo["id"],))
    url = f"/api/repos/{repo['id']}"
    assert client.patch(url, json={"enabled": True}).status_code == 400
    assert db.fetch_one("SELECT enabled, private_ack_by FROM repos")["enabled"] is False

    body = client.patch(url, json={"enabled": True, "acknowledge_private": True}).json()
    assert body["enabled"] is True and body["private"] is True
    assert db.fetch_one("SELECT enabled, private_ack_by FROM repos") == {"enabled": True, "private_ack_by": "maint"}
    log = rows("SELECT actor, action, target FROM audit_log")
    assert log == [{"actor": "maint", "action": "repo.enable", "target": "acme/widgets"}]

    assert client.patch(url, json={"enabled": False}).json()["enabled"] is False  # disabling needs no ack
    assert rows("SELECT action FROM audit_log ORDER BY id")[-1]["action"] == "repo.disable"


def test_patch_public_repo_needs_no_acknowledgement(client, calls, repo):
    db.execute("UPDATE repos SET enabled = false WHERE id = %s", (repo["id"],))
    assert client.patch(f"/api/repos/{repo['id']}", json={"enabled": True}).json()["enabled"] is True
    assert db.fetch_one("SELECT private_ack_by FROM repos")["private_ack_by"] is None


# --- queue -------------------------------------------------------------------------------------

def test_queue_listing_shape_and_suggestions(client, calls, box, repo):
    item = make_item(repo)
    make_decision(make_run(item), "spam", "true", {"true": 0.9, "false": 0.1}, 0.9)  # older run: not shown
    run = make_run(item)
    d_type = make_decision(run, "issue.type", "bug", {"bug": 0.7, "feature": 0.3}, 0.7)
    make_decision(run, "priority", "p1", {"p0": 0.1, "p1": 0.6, "p2": 0.2, "p3": 0.1}, 0.6, outcome="queued", threshold=0.9)
    make_decision(run, "issue.has_logs", "true", {"true": 0.99, "false": 0.01}, 0.99, outcome="acted")  # acted: no suggestion
    make_run(item, error="boom")  # the newest run failed: ignored
    qid = enqueue(item)
    held = enqueue(make_item(repo, 3), bucket="held")

    page = client.get(f"/api/repos/{repo['id']}/queue").json()
    assert page["next_cursor"] is None and [e["id"] for e in page["items"]] == [qid]
    e = page["items"][0]
    assert e["item"] == {"id": item["id"], "kind": "issue", "number": 1, "title": "Issue 1",
                         "html_url": "https://github.com/acme/widgets/issues/1", "author": "alice",
                         "created_at": e["item"]["created_at"]}
    assert (e["feature"], e["reason"], e["bucket"]) == ("issue_triage", "low confidence", "review")
    assert isinstance(e["age_hours"], float) and e["age_hours"] >= 0 and e["created_at"]
    sug = {s["question_id"]: s for s in e["suggestions"]}
    assert set(sug) == {"issue.type", "priority"}
    assert sug["issue.type"] == {"decision_id": d_type["id"], "question_id": "issue.type", "answer": "bug", "confidence": 0.7,
                                 "threshold": 0.85, "options": ["bug", "feature", "question", "docs"],
                                 "probabilities": {"bug": 0.7, "feature": 0.3}}
    assert sug["priority"]["options"] == ["p0", "p1", "p2", "p3"] and sug["priority"]["threshold"] == 0.9

    held_page = client.get(f"/api/repos/{repo['id']}/queue", params={"bucket": "held"}).json()
    assert [e["id"] for e in held_page["items"]] == [held] and held_page["items"][0]["suggestions"] == []

    box["role"] = "viewer"
    assert client.get(f"/api/repos/{repo['id']}/queue").status_code == 403


def test_queue_pagination_and_option_sources(client, calls, repo):
    ids = [enqueue(make_item(repo, n)) for n in (1, 2, 3)]
    url = f"/api/repos/{repo['id']}/queue"
    p1 = client.get(url, params={"limit": 2}).json()
    assert [e["id"] for e in p1["items"]] == ids[:2] and p1["next_cursor"] == str(ids[1])
    p2 = client.get(url, params={"limit": 2, "cursor": p1["next_cursor"]}).json()
    assert [e["id"] for e in p2["items"]] == ids[2:] and p2["next_cursor"] is None
    assert client.get(url, params={"limit": 500}).status_code == 422

    item = make_item(repo, 9)
    run = make_run(item)
    make_decision(run, "route.area", "api", {"api": 0.6, "cli": 0.4}, 0.6)  # criteria are per repo -> probability keys
    make_decision(run, "pr.follows_rules", "1", {"0": 0.2, "1": 0.5, "2": 0.3}, 0.5)
    make_decision(run, "gate.same_as#12", "true", {"true": 0.9, "false": 0.1}, 0.9)
    enqueue(item)
    last = client.get(url, params={"cursor": ids[2]}).json()["items"][0]["suggestions"]
    assert {s["question_id"]: s["options"] for s in last} == {
        "route.area": ["api", "cli"], "pr.follows_rules": ["0", "1", "2"], "gate.same_as#12": ["true", "false"]}


def test_accept_records_truth_overrides_and_applies_labels(client, calls, repo):
    item, d_type, d_prio, qid = triaged(repo)
    make_decision({"id": d_type["run_id"]}, "gate.same_as#12", "true", {"true": 0.8, "false": 0.2}, 0.8)

    r = client.post(f"/api/queue/{qid}/resolve", json={"action": "accept", "answers": {str(d_type["id"]): "feature"}})
    assert r.json() == {"ok": True}
    assert calls["label"] == [(item["id"], ["issue.type=feature"], d_type["id"]), (item["id"], ["priority=p1"], d_prio["id"])]
    truth = {t["question_id"]: (t["answer"], t["source"]) for t in rows("SELECT * FROM ground_truth")}
    assert truth == {"issue.type": ("feature", "override"), "priority": ("p1", "override"), "gate.same_as#12": ("true", "override")}
    ov = rows("SELECT * FROM overrides")
    assert len(ov) == 1 and (ov[0]["decision_id"], ov[0]["new_answer"], ov[0]["user_login"], ov[0]["github_user_id"]) == (
        d_type["id"], "feature", "maint", 7)
    q = db.fetch_one("SELECT status, resolved_by, resolved_at FROM queue_items")
    assert q["status"] == "accepted" and q["resolved_by"] == "maint" and q["resolved_at"]
    assert rows("SELECT action, target FROM audit_log") == [{"action": "queue.accept", "target": str(qid)}]
    assert client.post(f"/api/queue/{qid}/resolve", json={"action": "accept"}).status_code == 409  # not twice


def test_accept_rejects_unknown_answer_and_failed_label_keeps_entry_open(client, calls, repo, monkeypatch):
    item, d_type, d_prio, qid = triaged(repo)
    bad = client.post(f"/api/queue/{qid}/resolve", json={"action": "accept", "answers": {str(d_type["id"]): "nonsense"}})
    assert bad.status_code == 400 and calls["label"] == []

    def boom(*a):
        raise RuntimeError("github down")

    monkeypatch.setattr(sys.modules["app.actions"], "label", boom)
    with pytest.raises(RuntimeError):
        client.post(f"/api/queue/{qid}/resolve", json={"action": "accept"})
    assert db.fetch_one("SELECT status FROM queue_items")["status"] == "open"
    assert rows("SELECT * FROM ground_truth") == [] and rows("SELECT * FROM overrides") == []


def test_accept_confirming_suggestions_makes_no_override(client, calls, repo):
    item, d_type, d_prio, qid = triaged(repo)
    make_decision({"id": d_type["run_id"]}, "spam", "true", {"true": 0.9, "false": 0.1}, 0.9)
    client.post(f"/api/queue/{qid}/resolve", json={"action": "accept"})
    assert rows("SELECT * FROM overrides") == []
    assert [c[1] for c in calls["label"]] == [["issue.type=bug"], ["priority=p1"], ["spam"]]
    assert len(rows("SELECT * FROM ground_truth")) == 3


def test_dismiss_closes_without_truth_or_labels(client, calls, repo):
    item, *_, qid = triaged(repo)
    assert client.post(f"/api/queue/{qid}/resolve", json={"action": "dismiss"}).json() == {"ok": True}
    assert db.fetch_one("SELECT status FROM queue_items")["status"] == "dismissed"
    assert rows("SELECT * FROM ground_truth") == [] and calls["label"] == []


def test_resolve_needs_maintainer(client, calls, box, repo):
    *_, qid = triaged(repo)
    box["role"] = "viewer"
    assert client.post(f"/api/queue/{qid}/resolve", json={"action": "dismiss"}).status_code == 403
    assert db.fetch_one("SELECT status FROM queue_items")["status"] == "open"


def test_release_held_item_reruns_triage(client, calls, repo):
    item = make_item(repo, 5, title="Odd report")
    qid = enqueue(item, bucket="held", feature="inbound_gate")
    assert client.post(f"/api/queue/{qid}/resolve", json={"action": "release"}).json() == {"ok": True}

    assert db.fetch_one("SELECT status, resolved_by FROM queue_items") == {"status": "released", "resolved_by": "maint"}
    assert {t["question_id"]: t["answer"] for t in rows("SELECT * FROM ground_truth")} == {
        "gate.grounded": "true", "gate.known_non_issue": "false"}
    assert calls["unlabel"] == [(item["id"], "held", None)]
    [(kind, payload, trigger)] = calls["process"]
    assert (kind, trigger) == ("issue", "release")
    assert payload == {"number": 5, "title": "Odd report", "body": "body", "user": {"login": "alice"},
                       "author_association": "NONE", "html_url": item["html_url"], "created_at": item["created_at"].isoformat()}


def test_release_only_for_held_bucket(client, calls, repo):
    *_, qid = triaged(repo)
    assert client.post(f"/api/queue/{qid}/resolve", json={"action": "release"}).status_code == 400
    assert calls["process"] == [] and db.fetch_one("SELECT status FROM queue_items")["status"] == "open"


# --- overrides, items --------------------------------------------------------------------------

def test_override_decision(client, calls, box, repo):
    item, d_type, *_ = triaged(repo)
    url = f"/api/decisions/{d_type['id']}/override"
    assert client.post(url, json={"answer": "nonsense"}).status_code == 400
    assert client.post(url, json={"answer": "docs"}).json() == {"ok": True}
    assert [(o["new_answer"], o["user_login"]) for o in rows("SELECT * FROM overrides")] == [("docs", "maint")]
    assert rows("SELECT question_id, answer FROM ground_truth") == [{"question_id": "issue.type", "answer": "docs"}]
    assert rows("SELECT action FROM audit_log") == [{"action": "decision.override"}]

    assert client.post(url, json={"answer": "bug"}).json() == {"ok": True}  # confirming = truth, no new override
    assert len(rows("SELECT * FROM overrides")) == 1
    assert rows("SELECT answer FROM ground_truth") == [{"answer": "bug"}]

    box["role"] = "viewer"
    assert client.post(url, json={"answer": "docs"}).status_code == 403


def test_item_detail(client, calls, box, repo):
    item, d_type, d_prio, _ = triaged(repo)
    db.execute("INSERT INTO actions (item_id, repo_id, decision_id, kind, github_ref, payload) VALUES (%s, %s, %s, 'label', 'acme/widgets#1', %s)",
               (item["id"], repo["id"], d_type["id"], Jsonb({"dry_run": True, "labels": ["bug"]})))
    db.execute("INSERT INTO overrides (decision_id, user_login, new_answer) VALUES (%s, 'bob', 'docs')", (d_type["id"],))
    box["role"] = "viewer"
    body = client.get(f"/api/items/{item['id']}").json()

    assert body["item"]["body"] == "body" and body["item"]["state"] == "open" and body["item"]["repo_id"] == repo["id"]
    assert body["item"]["number"] == 1 and body["item"]["kind"] == "issue"
    [run] = body["runs"]
    assert (run["trigger"], run["backend"], run["model_version"], run["calibrated"], run["state_text"], run["error"]) == (
        "webhook", "jev", "jev-1.13.0", True, "state", None)
    assert {"id", "latency_ms", "tokens_in", "cost_usd", "created_at"} <= run.keys()
    assert [(d["question_id"], d["outcome"], d["confidence"], d["threshold"]) for d in run["decisions"]] == [
        ("issue.type", "shadow", 0.7, 0.85), ("priority", "queued", 0.6, 0.9)]
    assert run["decisions"][0]["probabilities"] == {"bug": 0.7, "feature": 0.3}
    assert [(a["kind"], a["github_ref"], a["dry_run"]) for a in body["actions"]] == [("label", "acme/widgets#1", True)]
    assert [(o["decision_id"], o["user"], o["new_answer"]) for o in body["overrides"]] == [(d_type["id"], "bob", "docs")]


def test_non_issue_items_need_maintainer(client, calls, box, repo):
    report = make_item(repo, kind="report")
    box["role"] = "viewer"
    assert client.get(f"/api/items/{report['id']}").status_code == 403
    box["role"] = "maintainer"
    assert client.get(f"/api/items/{report['id']}").json()["item"]["number"] is None


# --- evaluation --------------------------------------------------------------------------------

def test_preview_calibration_and_evaluation(client, calls, box, repo):
    box["role"] = "viewer"
    for n, (conf, truth) in enumerate([(0.9, "bug"), (0.8, "bug"), (0.6, "feature"), (0.95, None)], start=1):
        item = make_item(repo, n)
        make_decision(make_run(item), "issue.type", "bug", {"bug": conf, "feature": 1 - conf}, conf)
        if truth:
            make_truth(item, "issue.type", truth)
    base = f"/api/repos/{repo['id']}"

    p = client.get(f"{base}/preview", params={"question_id": "issue.type"}).json()
    assert (p["question_id"], p["threshold"]) == ("issue.type", 0.85)
    assert sorted(((x["confidence"], x["correct"]) for x in p["points"]), key=lambda t: t[0]) == [
        (0.6, False), (0.8, True), (0.9, True), (0.95, None)]

    c = client.get(f"{base}/calibration", params={"question_id": "issue.type"}).json()
    assert (c["question_id"], c["n"]) == ("issue.type", 3) and isinstance(c["ece"], float)
    assert len(c["bins"]) == 10 and set(c["bins"][0]) == {"lo", "hi", "n", "mean_confidence", "accuracy"}

    e = client.get(f"{base}/evaluation").json()
    assert e["backfill_status"] is None and "upper bound" in e["upper_bound_note"]
    [q] = e["questions"]
    assert (q["id"], q["n"], q["recommended_threshold"]) == ("issue.type", 3, None)
    assert q["accuracy"] == pytest.approx(2 / 3)
    assert q["confusion"] == {"labels": ["bug", "feature"], "matrix": [[2, 0], [1, 0]]}
    assert [(m["number"], m["answer"], m["truth"], m["confidence"]) for m in q["worst_misses"]] == [(3, "bug", "feature", 0.6)]
    assert {"item_id", "title", "html_url"} <= q["worst_misses"][0].keys()

    assert client.get(f"{base}/preview", params={"question_id": "nope"}).status_code == 404
    assert client.get(f"{base}/calibration", params={"question_id": "nope"}).status_code == 404


def test_backfill_queues_job(client, calls, box, repo):
    box["role"] = "viewer"
    assert client.post(f"/api/repos/{repo['id']}/backfill").status_code == 403
    box["role"] = "maintainer"
    assert client.post(f"/api/repos/{repo['id']}/backfill").json() == {"queued": True}
    assert db.fetch_one("SELECT backfill_status FROM repos")["backfill_status"] == "queued"
    assert calls["enqueue"] == [("backfill", {"repo_id": repo["id"]})]


# --- CI reports, flaky tests, config, labels, tokens, audit ---------------------------------------

def test_ci_reports_and_flaky_tests(client, calls, box, repo):
    cand = make_item(repo, 4, title="Same crash")
    rid = db.fetch_one(
        "INSERT INTO ci_reports (repo_id, source, payload, outcome, filed_issue_number, merged_into_number) "
        "VALUES (%s, 'ci', %s, 'merged', NULL, 4) RETURNING id",
        (repo["id"], Jsonb({"title": "test_x fails", "run_url": "https://ci/1"})))["id"]
    db.execute("INSERT INTO ci_candidates (report_id, candidate_item_id, retrieval_score, same_as_probability) VALUES (%s, %s, 0.4, 0.97)",
               (rid, cand["id"]))
    db.execute("INSERT INTO ci_reports (repo_id, source, payload) VALUES (%s, 'external', %s)", (repo["id"], Jsonb({"title": "other"})))
    db.execute("INSERT INTO flaky_tests (repo_id, test_id, occurrences, last_run_url) VALUES (%s, 'test_a', 3, 'https://ci/2'), (%s, 'test_b', 5, NULL)",
               (repo["id"], repo["id"]))

    page = client.get(f"/api/repos/{repo['id']}/ci-reports").json()
    assert [r["title"] for r in page["items"]] == ["other", "test_x fails"] and page["next_cursor"] is None
    r = page["items"][1]
    assert (r["source"], r["outcome"], r["issue_number"], r["merged_into"], r["run_url"]) == ("ci", "merged", None, 4, "https://ci/1")
    assert r["candidates"] == [{"item_id": cand["id"], "number": 4, "title": "Same crash", "retrieval_score": pytest.approx(0.4),
                                "same_as_probability": pytest.approx(0.97)}]
    assert page["items"][0]["candidates"] == []
    assert client.get(f"/api/repos/{repo['id']}/ci-reports", params={"limit": 1}).json()["next_cursor"] == str(page["items"][0]["id"])

    box["role"] = "viewer"
    flaky = client.get(f"/api/repos/{repo['id']}/flaky-tests").json()["items"]
    assert [(f["test_id"], f["occurrences"], f["last_run_url"]) for f in flaky] == [("test_b", 5, None), ("test_a", 3, "https://ci/2")]
    assert {"first_seen", "last_seen"} <= flaky[0].keys()


def test_config_and_render(client, calls, box, repo):
    box["role"] = "viewer"
    c = client.get(f"/api/repos/{repo['id']}/config").json()
    assert c == {"yaml": "yaml:features,comments", "source": "default", "parsed": {"features": {"spam": {"mode": "off"}}, "comments": False},
                 "edit_url": "https://gh/acme/widgets/main/False", "labels": ["bug", "feature"]}

    ok = client.post(f"/api/repos/{repo['id']}/config/render", json={"parsed": {"comments": True}}).json()
    assert ok == {"yaml": "yaml:comments", "edit_url": "https://gh/acme/widgets/main/False", "errors": []}
    bad = client.post(f"/api/repos/{repo['id']}/config/render", json={"parsed": {"bad": 1}}).json()
    assert bad["errors"] == ["a.b: bad", "c: worse"] and bad["yaml"] == "yaml:bad"


def test_labels_sync(client, calls, box, repo):
    box["role"] = "viewer"
    assert client.post(f"/api/repos/{repo['id']}/labels/sync").status_code == 403
    box["role"] = "maintainer"
    assert client.post(f"/api/repos/{repo['id']}/labels/sync").json() == {"created": ["bug", "p1"]}
    assert rows("SELECT action FROM audit_log") == [{"action": "labels.sync"}]


def test_ci_token_lifecycle(client, calls, repo):
    url = f"/api/repos/{repo['id']}/ci-tokens"
    made = client.post(url, json={"name": "main CI"}).json()
    assert made["name"] == "main CI" and made["token"].startswith("jt_") and len(made["token"]) > 40
    row = db.fetch_one("SELECT * FROM ci_tokens")
    assert row["id"] == made["id"] and row["created_by"] == "maint" and row["revoked_at"] is None
    assert row["token_hash"] == hashlib.sha256(made["token"].encode()).hexdigest() != made["token"]
    assert client.post(url, json={"name": ""}).status_code == 422

    listed = client.get(url).json()["items"]
    assert [(t["id"], t["name"], t["created_by"], t["revoked_at"]) for t in listed] == [(made["id"], "main CI", "maint", None)]
    assert "token" not in listed[0] and "token_hash" not in listed[0]

    assert client.delete(f"{url}/{made['id']}").json() == {"ok": True}
    assert db.fetch_one("SELECT revoked_at FROM ci_tokens")["revoked_at"] is not None
    assert client.get(url).json()["items"][0]["revoked_at"]
    assert client.delete(f"{url}/{made['id']}").status_code == 404
    assert [a["action"] for a in rows("SELECT action FROM audit_log ORDER BY id")] == ["ci_token.create", "ci_token.revoke"]
    assert "jt_" not in str(rows("SELECT details FROM audit_log"))  # plaintext never logged


def test_audit_page(client, calls, box, repo, org):
    for i in range(3):
        audit.log(org["id"], repo["id"], "maint", f"act{i}", "t", {"i": i})
    audit.log(org["id"], None, "maint", "other-repo")
    url = f"/api/repos/{repo['id']}/audit"
    p1 = client.get(url, params={"limit": 2}).json()
    assert [a["action"] for a in p1["items"]] == ["act2", "act1"] and p1["next_cursor"] == str(p1["items"][1]["id"])
    assert set(p1["items"][0]) == {"id", "actor", "action", "target", "details", "created_at"} and p1["items"][0]["details"] == {"i": 2}
    p2 = client.get(url, params={"limit": 2, "cursor": p1["next_cursor"]}).json()
    assert [a["action"] for a in p2["items"]] == ["act0"] and p2["next_cursor"] is None
    box["role"] = "viewer"
    assert client.get(url).status_code == 403
