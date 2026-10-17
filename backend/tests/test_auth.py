import sys
import types
from urllib.parse import parse_qs, urlparse

import httpx
import pytest
from fastapi import Depends, FastAPI, HTTPException
from fastapi.testclient import TestClient

import app as app_pkg
from app import auth, db
from app.settings import settings

api = FastAPI()
api.include_router(auth.router)


@api.get("/whoami")
def whoami(u: auth.User = Depends(auth.current_user)):
    return {"login": u.login}


@pytest.fixture
def client(monkeypatch):
    monkeypatch.setattr(settings, "github_client_id", "cid")
    monkeypatch.setattr(settings, "github_client_secret", "csecret")
    return TestClient(api)


def _fake_github(monkeypatch, token="gho_tok", user=None):
    calls = []
    user = user or {"id": 42, "login": "octo", "avatar_url": "http://a/octo.png"}

    def post(url, **kw):
        calls.append(url)
        body = {"access_token": token} if token else {"error": "bad_verification_code"}
        return httpx.Response(200, json=body, request=httpx.Request("POST", url))

    def get(url, **kw):
        calls.append((url, kw["headers"]["Authorization"]))
        return httpx.Response(200, json=user, request=httpx.Request("GET", url))

    monkeypatch.setattr(httpx, "post", post)
    monkeypatch.setattr(httpx, "get", get)
    return calls


def _login(client):
    r = client.get("/api/auth/login", follow_redirects=False)
    return r, parse_qs(urlparse(r.headers["location"]).query)["state"][0]


def test_login_redirects_to_github_with_signed_state_cookie(client):
    r, state = _login(client)
    assert r.status_code == 302
    url = urlparse(r.headers["location"])
    q = parse_qs(url.query)
    assert f"{url.scheme}://{url.netloc}{url.path}" == "https://github.com/login/oauth/authorize"
    assert q["client_id"] == ["cid"]
    assert q["redirect_uri"] == [f"{settings.dashboard_url}/api/auth/callback"]
    assert auth._signer("jt_state").loads(client.cookies["jt_state"]) == state


def test_cookies_are_secure_only_on_https_dashboard(client, monkeypatch):
    assert "secure" not in _login(client)[0].headers["set-cookie"].lower()
    monkeypatch.setattr(settings, "dashboard_url", "https://triage.example.com")
    assert "secure" in _login(client)[0].headers["set-cookie"].lower()


def test_callback_rejects_missing_or_wrong_state(client, monkeypatch):
    calls = _fake_github(monkeypatch)
    assert client.get("/api/auth/callback", params={"code": "c", "state": "x"}).status_code == 400  # no cookie
    _login(client)
    assert client.get("/api/auth/callback", params={"code": "c", "state": "forged"}).status_code == 400
    assert client.get("/api/auth/callback", params={"state": client.cookies["jt_state"]}).status_code == 400  # no code
    assert calls == [] and db.fetch_one("SELECT count(*) AS n FROM sessions")["n"] == 0


def test_callback_rejected_code_creates_no_session(client, monkeypatch):
    _fake_github(monkeypatch, token=None)
    _, state = _login(client)
    assert client.get("/api/auth/callback", params={"code": "c", "state": state}).status_code == 400
    assert db.fetch_one("SELECT count(*) AS n FROM sessions")["n"] == 0


def test_session_cookie_flow(client, monkeypatch):
    calls = _fake_github(monkeypatch)
    assert client.get("/whoami").status_code == 401

    _, state = _login(client)
    r = client.get("/api/auth/callback", params={"code": "abc", "state": state}, follow_redirects=False)
    assert r.status_code == 302 and r.headers["location"] == settings.dashboard_url
    assert calls == ["https://github.com/login/oauth/access_token", ("https://api.github.com/user", "Bearer gho_tok")]

    cookie = [h for h in r.headers.get_list("set-cookie") if h.startswith("jt_session=")][0].lower()
    assert "httponly" in cookie and "samesite=lax" in cookie

    row = db.fetch_one("SELECT *, expires_at - now() AS ttl FROM sessions")
    assert (row["github_user_id"], row["login"], row["token"]) == (42, "octo", "gho_tok")
    assert 13 * 86400 < row["ttl"].total_seconds() <= 14 * 86400
    assert client.cookies["jt_session"] != row["id"]  # cookie is signed, not the bare id

    assert client.get("/whoami").json() == {"login": "octo"}
    assert client.post("/api/auth/logout").json() == {"ok": True}
    assert db.fetch_one("SELECT count(*) AS n FROM sessions")["n"] == 0
    assert client.get("/whoami").status_code == 401


def test_current_user_401_for_tampered_and_expired_sessions(client):
    client.cookies.set("jt_session", "garbage")
    assert client.get("/whoami").status_code == 401
    db.execute("INSERT INTO sessions (id, github_user_id, login, token, expires_at) VALUES ('old', 1, 'x', 't', now() - interval '1 hour')")
    client.cookies.set("jt_session", auth._signer("jt_session").dumps("old"))
    assert client.get("/whoami").status_code == 401


def _stub_github(monkeypatch, perms):
    calls = []

    class Client:
        def permission(self, repo, login):
            calls.append((repo, login))
            return perms[login]

    mod = types.ModuleType("app.github")
    mod.client_for = lambda repo_row: Client()
    monkeypatch.setitem(sys.modules, "app.github", mod)
    monkeypatch.setattr(app_pkg, "github", mod, raising=False)
    return calls


def test_role_maps_github_permission_and_caches(monkeypatch, repo):
    perms = {"adm": "admin", "mnt": "maintain", "wr": "write", "tri": "triage", "rd": "read", "nobody": None}
    calls = _stub_github(monkeypatch, perms)
    want = {"adm": "admin", "mnt": "maintainer", "wr": "maintainer", "tri": "maintainer", "rd": "viewer", "nobody": None}
    for i, (login, expected) in enumerate(want.items()):
        u = auth.User(i, login, "", "t")
        assert auth.role(u, repo) == expected
        assert auth.role(u, repo) == expected  # second call served from redis
    assert len(calls) == len(perms)
    assert calls[0] == ("acme/widgets", "adm")


def test_require_repo(monkeypatch, repo):
    user = auth.User(1, "u", "", "t")
    current = {"v": "viewer"}
    monkeypatch.setattr(auth, "role", lambda u, r: current["v"])

    with pytest.raises(HTTPException) as e:
        auth.require_repo(user, 9999)
    assert e.value.status_code == 404

    got = auth.require_repo(user, repo["id"])
    assert got["full_name"] == "acme/widgets" and got["role"] == "viewer"
    with pytest.raises(HTTPException) as e:
        auth.require_repo(user, repo["id"], "maintainer")
    assert e.value.status_code == 403

    current["v"] = "admin"
    assert auth.require_repo(user, repo["id"], "maintainer")["role"] == "admin"
    current["v"] = None
    with pytest.raises(HTTPException) as e:
        auth.require_repo(user, repo["id"])
    assert e.value.status_code == 403
