import hashlib
import hmac
import importlib
import json
import sys
import types
from types import SimpleNamespace

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from psycopg.types.json import Jsonb

import app as app_pkg
from app import db


def _ensure(name):  # modules owned by other workers may not exist yet
    try:
        return importlib.import_module(f"app.{name}")
    except ModuleNotFoundError as e:
        if e.name != f"app.{name}":
            raise
        mod = sys.modules[f"app.{name}"] = types.ModuleType(f"app.{name}")
        setattr(app_pkg, name, mod)
        return mod


github = _ensure("github")
from app import jobs, webhooks, worker  # noqa: E402
from app.redis_client import redis  # noqa: E402
from app.settings import settings  # noqa: E402


def sign(body: bytes) -> str:
    return "sha256=" + hmac.new(settings.github_webhook_secret.encode(), body, hashlib.sha256).hexdigest()


@pytest.fixture
def client(monkeypatch):
    def verify(body, header):
        return bool(header) and hmac.compare_digest(header, sign(body))

    monkeypatch.setattr(github, "verify_signature", verify, raising=False)
    api = FastAPI()
    api.include_router(webhooks.router)
    return TestClient(api)


def post(client, payload, delivery="d1", event="issues", signature=True):
    body = json.dumps(payload).encode()
    headers = {"X-GitHub-Delivery": delivery, "X-GitHub-Event": event, "Content-Type": "application/json"}
    if signature:
        headers["X-Hub-Signature-256"] = sign(body)
    return client.post("/api/github/webhook", content=body, headers=headers)


def test_bad_signature_rejected(client):
    assert post(client, {"a": 1}, signature=False).status_code == 401
    assert redis.llen(jobs.QUEUE) == 0
    assert db.fetch_one("SELECT count(*) AS n FROM webhook_deliveries")["n"] == 0


def test_enqueues_once_per_delivery(client):
    r = post(client, {"action": "opened"})
    assert (r.status_code, r.json()) == (202, {"ok": True})
    job = json.loads(redis.lpop(jobs.QUEUE))
    assert job == {"type": "webhook", "payload": {"event": "issues", "payload": {"action": "opened"}}, "attempts": 0}

    dup = post(client, {"action": "opened"})
    assert (dup.status_code, dup.json()) == (200, {"ok": True, "duplicate": True})
    assert redis.llen(jobs.QUEUE) == 0
    assert post(client, {"action": "opened"}, delivery="d2").status_code == 202


def test_enqueue_failure_allows_redelivery(client, monkeypatch):
    def down(*a, **k):
        raise RuntimeError("redis down")

    monkeypatch.setattr(jobs, "enqueue", down)
    with pytest.raises(RuntimeError):
        post(client, {"action": "opened"})
    assert db.fetch_one("SELECT count(*) AS n FROM webhook_deliveries")["n"] == 0


# --- job dispatch -------------------------------------------------------------------------------------------------

@pytest.fixture
def calls(monkeypatch):
    out = []
    fakes = {
        "pipeline": SimpleNamespace(process=lambda repo, kind, p, trigger: out.append(("process", kind, p["number"], trigger))),
        "install": SimpleNamespace(handle_installation=lambda ev, p: out.append(("install", ev))),
        "repo_config": SimpleNamespace(load=lambda r, refresh=False: out.append(("load", r["id"], refresh))),
        "backfill": SimpleNamespace(run=lambda repo_id, limit=None: out.append(("backfill", repo_id))),
    }
    for name, fake in fakes.items():
        monkeypatch.setattr(app_pkg, name, fake, raising=False)
    return out


def event(action, **kw):
    return {"action": action, "repository": {"id": 2001, "default_branch": "main"}, **kw}


def issue(n=1):
    return {"number": n, "title": "t", "body": "b"}


def queued():
    return [json.loads(x) for x in redis.lrange(jobs.QUEUE, 0, -1)]


def test_issue_events(calls, repo):
    jobs.webhook("issues", event("opened", issue=issue()))
    jobs.webhook("issues", event("reopened", issue=issue(2)))
    jobs.webhook("issues", event("edited", issue=issue(3), changes={"labels": {}}))  # not a text edit
    jobs.webhook("issues", event("edited", issue=issue(4), changes={"body": {"from": "x"}}))
    jobs.webhook("issues", event("labeled", issue=issue(5)))
    assert calls == [("process", "issue", 1, "opened"), ("process", "issue", 2, "reopened"), ("process", "issue", 4, "edited")]


def test_disabled_or_unknown_repo_ignored(calls, repo):
    db.execute("UPDATE repos SET enabled = false")
    jobs.webhook("issues", event("opened", issue=issue()))
    db.execute("UPDATE repos SET enabled = true")
    jobs.webhook("issues", {"action": "opened", "issue": issue(), "repository": {"id": 999}})
    assert calls == []


def test_pull_request_events(calls, repo):
    pr = lambda n, **kw: {"number": n, "draft": False, **kw}  # noqa: E731
    jobs.webhook("pull_request", event("opened", pull_request=pr(1, draft=True)))
    jobs.webhook("pull_request", event("ready_for_review", pull_request=pr(1)))
    jobs.webhook("pull_request", event("synchronize", pull_request=pr(2)))
    jobs.webhook("pull_request", event("edited", pull_request=pr(3)))
    assert calls == [("process", "pr", 1, "ready_for_review"), ("process", "pr", 2, "synchronize")]


def test_closed_and_deleted_update_items(calls, repo):
    for kind, n in (("issue", 1), ("pr", 2), ("issue", 3)):
        db.execute("INSERT INTO items (repo_id, kind, github_number, source) VALUES (%s, %s, %s, 'webhook')", (repo["id"], kind, n))
    jobs.webhook("issues", event("closed", issue=issue(1)))
    jobs.webhook("pull_request", event("closed", pull_request={"number": 2, "merged": True}))
    jobs.webhook("issues", event("deleted", issue=issue(3)))
    rows = {r["github_number"]: r["state"] for r in db.fetch_all("SELECT * FROM items")}
    assert rows == {1: "closed", 2: "merged"}


def test_installation_events(calls, repo):
    jobs.webhook("installation", {"action": "created"})
    jobs.webhook("installation_repositories", {"action": "added"})
    assert calls == [("install", "installation"), ("install", "installation_repositories")]


def push(commits, ref="refs/heads/main"):
    return event("", ref=ref, commits=[{"added": [], "removed": [], "modified": c} for c in commits])


def test_push_syncs_config_changes(calls, repo):
    jobs.webhook("push", push([[".github/oss-inbox.yml"]]))
    assert queued() == [{"type": "sync_repo", "payload": {"repo_id": repo["id"]}, "attempts": 0}]
    redis.delete(jobs.QUEUE)
    jobs.webhook("push", push([[".github/jev-triage.yml"]]))  # the pre-rename path still counts
    assert len(queued()) == 1
    redis.delete(jobs.QUEUE)
    jobs.webhook("push", push([["README.md"]]))
    jobs.webhook("push", push([[".github/oss-inbox.yml"]], ref="refs/heads/feature"))
    db.execute("UPDATE repos SET config = %s", (Jsonb({"rules_file": "CONTRIBUTING.md"}),))
    jobs.webhook("push", push([["CONTRIBUTING.md"]]))
    assert len(queued()) == 1


def test_push_to_org_defaults_repo_syncs_every_enabled_repo(calls, repo):
    ids = [db.fetch_one("INSERT INTO repos (org_id, github_repo_id, full_name, enabled) VALUES (%s, %s, %s, %s) RETURNING id",
                        (repo["org_id"], 3000 + i, name, en))["id"]
           for i, (name, en) in enumerate([("acme/.github", True), ("acme/off", False)])]
    jobs.webhook("push", {**push([[".github/oss-inbox.yml"]]), "repository": {"id": 3000, "default_branch": "main"}})
    assert sorted(j["payload"]["repo_id"] for j in queued()) == sorted([repo["id"], ids[0]])


def test_other_handlers(calls, repo):
    jobs.HANDLERS["sync_repo"](repo["id"])
    jobs.HANDLERS["backfill"](repo["id"])
    assert calls == [("load", repo["id"], True), ("backfill", repo["id"])]


def test_reprocess_rebuilds_payload_from_item(calls, repo):
    item = db.fetch_one("INSERT INTO items (repo_id, kind, github_number, source, author) VALUES (%s, 'issue', 5, 'webhook', 'bob') RETURNING id",
                        (repo["id"],))
    jobs.HANDLERS["reprocess"](item["id"])
    assert calls == [("process", "issue", 5, "release")]


# --- worker -------------------------------------------------------------------------------------------------------

def test_failing_job_retried_then_dead_lettered(monkeypatch):
    monkeypatch.setattr(worker.time, "sleep", lambda s: None)
    attempts = []

    def boom(x):
        attempts.append(x)
        raise ValueError("nope")

    monkeypatch.setitem(jobs.HANDLERS, "boom", boom)
    jobs.enqueue("boom", x=1)
    for _ in range(3):
        worker.run_job(redis.lpop(jobs.QUEUE))
    assert len(attempts) == 3 and redis.llen(jobs.QUEUE) == 0
    dead = json.loads(redis.lpop(jobs.DEAD))
    assert dead["type"] == "boom" and dead["attempts"] == 3 and "nope" in dead["error"]


def test_purge_drops_old_text_only(monkeypatch, repo):
    monkeypatch.setattr(settings, "retention_days", 30)
    items = {}
    for name, age in (("old", 40), ("new", 1)):
        items[name] = db.fetch_one(
            "INSERT INTO items (repo_id, kind, github_number, source, body, updated_at) "
            "VALUES (%s, 'issue', %s, 'webhook', 'secret', now() - make_interval(days => %s)) RETURNING id",
            (repo["id"], age, age))["id"]
        db.execute("INSERT INTO decision_runs (item_id, trigger, backend, state_hash, state_text, created_at) "
                   "VALUES (%s, 'opened', 'jev', 'h', 'state', now() - make_interval(days => %s))", (items[name], age))
    jobs.purge()
    assert {r["id"]: r["body"] for r in db.fetch_all("SELECT id, body FROM items")} == {items["old"]: "", items["new"]: "secret"}
    assert {r["item_id"]: r["state_text"] for r in db.fetch_all("SELECT item_id, state_text FROM decision_runs")} == \
        {items["old"]: None, items["new"]: "state"}
