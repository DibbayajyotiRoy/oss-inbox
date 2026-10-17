import base64
import hashlib
import hmac
import sys
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace

import httpx
import jwt
import pytest
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import rsa

from app import db, install
from app.github import client as gh
from app.repo_config import parse_config
from app.settings import settings


sleeps: list[float] = []


def make_client(monkeypatch, handler):
    monkeypatch.setattr(gh, "_transport", httpx.MockTransport(handler))
    monkeypatch.setattr(gh, "installation_token", lambda _id: "tok")
    monkeypatch.setattr(gh.time, "sleep", lambda s: sleeps.append(s))
    sleeps.clear()
    return gh.GitHubClient(1001)


def test_verify_signature(monkeypatch):
    monkeypatch.setattr(settings, "github_webhook_secret", "s3cret")
    body = b'{"a":1}'
    good = "sha256=" + hmac.new(b"s3cret", body, hashlib.sha256).hexdigest()
    assert gh.verify_signature(body, good)
    assert not gh.verify_signature(body, good[:-1] + "0")
    assert not gh.verify_signature(body + b" ", good)
    assert not gh.verify_signature(body, None)
    assert not gh.verify_signature(body, "sha256=é")


def test_app_jwt_and_installation_token_cached(monkeypatch):
    key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    pem = key.private_bytes(serialization.Encoding.PEM, serialization.PrivateFormat.PKCS8, serialization.NoEncryption())
    monkeypatch.setattr(settings, "github_private_key", pem.decode())
    monkeypatch.setattr(settings, "github_app_id", "123")
    claims = jwt.decode(gh.app_jwt(), key.public_key(), algorithms=["RS256"], options={"verify_iat": False})
    assert claims["iss"] == "123" and claims["exp"] - claims["iat"] == 600

    calls = []

    def handler(req):
        calls.append(req)
        exp = (datetime.now(timezone.utc) + timedelta(hours=1)).strftime("%Y-%m-%dT%H:%M:%SZ")
        return httpx.Response(201, json={"token": "ghs_abc", "expires_at": exp})

    monkeypatch.setattr(gh, "_transport", httpx.MockTransport(handler))
    assert gh.installation_token(7) == "ghs_abc"
    assert gh.installation_token(7) == "ghs_abc"
    assert len(calls) == 1
    assert calls[0].url.path == "/app/installations/7/access_tokens"
    assert jwt.decode(calls[0].headers["authorization"].removeprefix("Bearer "), key.public_key(),
                      algorithms=["RS256"], options={"verify_iat": False})["iss"] == "123"
    assert gh.redis.ttl("gh:token:7") > 3000  # expires_at minus 5 minutes


def test_paginate_follows_link_and_max_items(monkeypatch):
    def handler(req):
        if req.url.params.get("page") == "2":
            return httpx.Response(200, json=[{"n": 3}])
        return httpx.Response(200, json=[{"n": 1}, {"n": 2}],
                              headers={"Link": '<https://api.github.com/x?page=2>; rel="next", <https://api.github.com/x?page=2>; rel="last"'})

    c = make_client(monkeypatch, handler)
    assert [i["n"] for i in c.paginate("/x")] == [1, 2, 3]
    assert [i["n"] for i in c.paginate("/x", max_items=2)] == [1, 2]


def test_paginate_unwraps_search_results(monkeypatch):
    c = make_client(monkeypatch, lambda req: httpx.Response(200, json={"total_count": 1, "items": [{"number": 5}]}))
    assert c.search_issues("repo:a/b is:issue") == [{"number": 5}]


def test_retry_on_5xx_then_success(monkeypatch):
    seen = []

    def handler(req):
        seen.append(1)
        return httpx.Response(502) if len(seen) < 3 else httpx.Response(200, json={"ok": True})

    c = make_client(monkeypatch, handler)
    assert c.request("GET", "/x") == {"ok": True}
    assert len(seen) == 3 and sleeps == [1, 2]


def test_retry_gives_up_after_three_retries(monkeypatch):
    seen = []
    c = make_client(monkeypatch, lambda req: (seen.append(1), httpx.Response(500))[1])
    with pytest.raises(httpx.HTTPStatusError):
        c.request("GET", "/x")
    assert len(seen) == 4


def test_rate_limit_waits_capped(monkeypatch):
    replies = iter([
        httpx.Response(403, headers={"Retry-After": "2"}),
        httpx.Response(403, headers={"x-ratelimit-remaining": "0", "x-ratelimit-reset": str(int(gh.time.time()) + 3600)}),
        httpx.Response(200, json=[]),
    ])
    c = make_client(monkeypatch, lambda req: next(replies))
    assert c.request("GET", "/x") == []
    assert sleeps == [2, 30]


def test_plain_403_is_not_retried(monkeypatch):
    seen = []
    c = make_client(monkeypatch, lambda req: (seen.append(1), httpx.Response(403, json={"message": "forbidden"}))[1])
    with pytest.raises(httpx.HTTPStatusError):
        c.request("GET", "/x")
    assert len(seen) == 1 and sleeps == []


def test_original_body_picks_earliest_edit(monkeypatch):
    nodes = [{"editedAt": "2024-03-01T00:00:00Z", "diff": "later"}, {"editedAt": "2024-01-01T00:00:00Z", "diff": "first"},
             {"editedAt": "2024-02-01T00:00:00Z", "diff": "middle"}]
    reply = {"data": {"repository": {"issueOrPullRequest": {"userContentEdits": {"nodes": nodes}}}}}
    c = make_client(monkeypatch, lambda req: httpx.Response(200, json=reply))
    assert c.original_body("a/b", 1) == "first"
    reply["data"]["repository"]["issueOrPullRequest"]["userContentEdits"]["nodes"] = []
    assert c.original_body("a/b", 1) is None
    reply["data"]["repository"]["issueOrPullRequest"] = {}  # never edited: fragment matched nothing
    assert c.original_body("a/b", 1) is None


def test_permission_prefers_role_name_and_404_is_none(monkeypatch):
    def handler(req):
        if "ghost" in req.url.path:
            return httpx.Response(404)
        return httpx.Response(200, json={"permission": "write", "role_name": "maintain"})

    c = make_client(monkeypatch, handler)
    assert c.permission("a/b", "alice") == "maintain"
    assert c.permission("a/b", "ghost") is None


def test_remove_label_ignores_404_and_encodes(monkeypatch):
    paths = []
    c = make_client(monkeypatch, lambda req: (paths.append(req.url.raw_path.decode()), httpx.Response(404))[1])
    c.remove_label("a/b", 3, "priority: p0")
    assert paths == ["/repos/a/b/issues/3/labels/priority%3A%20p0"]


def test_get_file_and_tree_cache(monkeypatch):
    calls = []

    def handler(req):
        calls.append(req.url.path)
        if "/contents/" in req.url.path:
            if req.url.path.endswith("missing.md"):
                return httpx.Response(404)
            return httpx.Response(200, json={"content": base64.encodebytes(b"hello").decode(), "sha": "abc"})
        return httpx.Response(200, json={"tree": [{"path": "src", "type": "tree"}, {"path": "src/a.py", "type": "blob"}]})

    c = make_client(monkeypatch, handler)
    assert c.get_file("a/b", "docs/x.md") == ("hello", "abc")
    assert c.get_file("a/b", "missing.md") is None
    assert c.get_tree_paths("a/b") == {"src/a.py"}
    assert c.get_tree_paths("a/b") == {"src/a.py"}
    assert sum("/git/trees/" in p for p in calls) == 1


def test_installation_for_repo(repo):
    assert gh.installation_for_repo(repo) == 1001


# --- install -------------------------------------------------------------------------------------------------------


@pytest.fixture
def jobs(monkeypatch):
    queued = []
    monkeypatch.setitem(sys.modules, "app.jobs", SimpleNamespace(enqueue=lambda t, **p: queued.append((t, p))))
    return queued


def installation_payload(action, repos=None):
    p = {"action": action, "installation": {"id": 555, "account": {"login": "acme", "avatar_url": "http://a/v.png"}}}
    if repos is not None:
        p["repositories"] = repos
    return p


class FakeInstClient:
    def __init__(self, installation_id):
        pass

    def paginate(self, path, params=None, max_items=None):
        assert path == "/installation/repositories"
        yield {"id": 1, "full_name": "acme/pub", "private": False, "default_branch": "trunk", "description": "d"}
        yield {"id": 2, "full_name": "acme/priv", "private": True, "default_branch": "dev", "description": None}


def test_install_created_private_repos_disabled(monkeypatch, jobs):
    monkeypatch.setattr(install, "GitHubClient", FakeInstClient)
    stubs = [{"id": 1, "full_name": "acme/pub", "private": False}, {"id": 2, "full_name": "acme/priv", "private": True}]
    install.handle_installation("installation", installation_payload("created", stubs))

    org = db.fetch_one("SELECT * FROM orgs")
    assert (org["github_installation_id"], org["login"], org["avatar_url"]) == (555, "acme", "http://a/v.png")
    repos = {r["full_name"]: r for r in db.fetch_all("SELECT * FROM repos")}
    assert repos["acme/pub"]["enabled"] and repos["acme/pub"]["default_branch"] == "trunk"
    assert not repos["acme/priv"]["enabled"] and repos["acme/priv"]["private"]
    assert repos["acme/priv"]["default_branch"] == "dev" and repos["acme/priv"]["description"] == ""
    assert sorted(p["repo_id"] for t, p in jobs if t == "sync_repo") == sorted(r["id"] for r in repos.values())


def test_install_reupsert_keeps_admin_enable_but_private_flip_disables(monkeypatch, jobs):
    monkeypatch.setattr(install, "GitHubClient", FakeInstClient)
    full = [{"id": 1, "full_name": "acme/pub", "private": False, "default_branch": "main"},
            {"id": 2, "full_name": "acme/priv", "private": True, "default_branch": "main"}]
    install.handle_installation("installation", installation_payload("created", full))
    db.execute("UPDATE repos SET enabled = true WHERE full_name = 'acme/priv'")  # admin acknowledged
    full[0]["private"] = True  # public repo turned private
    install.handle_installation("installation_repositories", {**installation_payload("added"), "repositories_added": full})
    enabled = {r["full_name"]: r["enabled"] for r in db.fetch_all("SELECT full_name, enabled FROM repos")}
    assert enabled == {"acme/pub": False, "acme/priv": True}


def test_install_repositories_removed_and_deleted(monkeypatch, jobs):
    monkeypatch.setattr(install, "GitHubClient", FakeInstClient)
    install.handle_installation("installation", installation_payload("created", []))
    install.handle_installation("installation_repositories", {**installation_payload("added"), "repositories_added": [
        {"id": 1, "full_name": "acme/pub", "private": False, "default_branch": "main"}]})
    assert db.fetch_one("SELECT count(*) AS n FROM repos")["n"] == 1
    install.handle_installation("installation_repositories", {**installation_payload("removed"), "repositories_removed": [{"id": 1}]})
    assert db.fetch_one("SELECT count(*) AS n FROM repos")["n"] == 0
    install.handle_installation("installation_repositories", {**installation_payload("added"), "repositories_added": [
        {"id": 1, "full_name": "acme/pub", "private": False, "default_branch": "main"}]})
    install.handle_installation("installation", installation_payload("deleted"))
    assert db.fetch_one("SELECT count(*) AS n FROM orgs")["n"] == 0
    assert db.fetch_one("SELECT count(*) AS n FROM repos")["n"] == 0


def test_install_unsuspend_lists_repositories(monkeypatch, jobs):
    monkeypatch.setattr(install, "GitHubClient", FakeInstClient)
    install.handle_installation("installation", installation_payload("suspend"))
    assert db.fetch_one("SELECT count(*) AS n FROM repos")["n"] == 0 and not jobs
    install.handle_installation("installation", installation_payload("unsuspend"))
    assert db.fetch_one("SELECT count(*) AS n FROM repos")["n"] == 2 and len(jobs) == 2


def test_propose_label_map():
    existing = ["type: bug", "kind/feature", "Question", "documentation", "P0", "priority/p1", "Needs Info", "unrelated"]
    assert install.propose_label_map(existing) == {
        "issue.type": {"bug": "type: bug", "feature": "kind/feature", "question": "Question"},
        "priority": {"p0": "P0", "p1": "priority/p1"},
        "needs_info": "Needs Info",
    }
    assert install.propose_label_map(["bug", "enhancement"]) == {}


def test_ensure_labels_creates_only_missing(monkeypatch, repo):
    created = []

    class Fake:
        def list_labels(self, full):
            return ["Bug", "enhancement", "question", "documentation"]

        def create_label(self, full, name, color="ededed", description=""):
            created.append(name)

    monkeypatch.setattr(install, "client_for", lambda r: Fake())
    monkeypatch.setattr(install, "load", lambda r: parse_config("labels: {needs_info: Needs Info}\nareas: {core: {}}"))
    out = install.ensure_labels(repo)
    assert out == created and "bug" not in created and "enhancement" not in created
    assert {"Needs Info", "area: core", "priority: p0", "jev: held", "ci-report"} <= set(created)
    assert "needs-info" not in created
