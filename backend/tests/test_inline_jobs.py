import hashlib
import hmac
import json

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app import backfill, github, jobs, repo_config, webhooks
from app.redis_client import redis
from app.settings import settings

PUSH = {"ref": "refs/heads/main", "repository": {"id": 2001, "default_branch": "main"},
        "commits": [{"modified": [".github/oss-inbox.yml"]}]}


@pytest.fixture
def ran(monkeypatch):
    calls = []
    monkeypatch.setitem(jobs.HANDLERS, "rec", lambda **p: calls.append(p))
    return calls


def test_queued_by_default(ran):
    jobs.enqueue("rec", x=1)
    assert ran == [] and json.loads(redis.lpop(jobs.QUEUE))["payload"] == {"x": 1}


def test_inline_runs_now(ran, monkeypatch):
    monkeypatch.setattr(settings, "inline_jobs", True)
    jobs.enqueue("rec", x=1)
    assert ran == [{"x": 1}] and redis.llen(jobs.QUEUE) == 0


def test_inline_failure_is_swallowed_and_dead_lettered(monkeypatch):
    def boom(x):
        raise ValueError("nope")

    monkeypatch.setattr(settings, "inline_jobs", True)
    monkeypatch.setitem(jobs.HANDLERS, "boom", boom)
    jobs.enqueue("boom", x=1)  # must not raise
    dead = json.loads(redis.lpop(jobs.DEAD))
    assert dead["type"] == "boom" and dead["payload"] == {"x": 1} and "nope" in dead["error"] and redis.llen(jobs.QUEUE) == 0


def test_inline_backfill_and_nested_enqueue(monkeypatch, repo):
    got = []
    monkeypatch.setattr(settings, "inline_jobs", True)
    monkeypatch.setattr(backfill, "run", lambda repo_id, limit: got.append(("backfill", repo_id, limit)))
    monkeypatch.setattr(repo_config, "load", lambda r, refresh: got.append(("load", r["id"], refresh)))
    jobs.enqueue("backfill", repo_id=repo["id"])
    jobs.enqueue("webhook", event="push", payload=PUSH)  # the push handler enqueues sync_repo, which also runs inline
    assert got == [("backfill", repo["id"], None), ("load", repo["id"], True)] and redis.llen(jobs.QUEUE) == 0


def test_webhook_still_202_when_inline(monkeypatch, ran):
    monkeypatch.setattr(settings, "inline_jobs", True)
    monkeypatch.setitem(jobs.HANDLERS, "webhook", lambda **p: ran.append(p))
    monkeypatch.setattr(github, "verify_signature", lambda body, header: True)
    api = FastAPI()
    api.include_router(webhooks.router)
    body = json.dumps({"zen": "x"}).encode()
    r = TestClient(api).post("/api/github/webhook", content=body, headers={
        "X-GitHub-Delivery": "d1", "X-GitHub-Event": "ping", "X-Hub-Signature-256": "sha256=" + hmac.new(b"k", body, hashlib.sha256).hexdigest()})
    assert r.status_code == 202 and ran == [{"event": "ping", "payload": {"zen": "x"}}] and redis.llen(jobs.QUEUE) == 0
