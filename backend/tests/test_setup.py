import json
from html import unescape

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.api import setup
from app.settings import settings


@pytest.fixture
def client(monkeypatch, tmp_path):
    monkeypatch.setattr(settings, "github_app_id", "")
    monkeypatch.setattr(settings, "public_url", "https://triage.example.com")
    monkeypatch.setattr(settings, "dashboard_url", "https://dash.example.com")
    monkeypatch.setenv("SETUP_ENV_PATH", str(tmp_path / ".env"))
    app = FastAPI()
    app.include_router(setup.router)
    return TestClient(app, base_url="https://triage.example.com")


class Resp:
    status_code = 201

    def json(self):
        return {"id": 42, "slug": "jev-triage-x", "pem": "-----BEGIN-----\nabc\n-----END-----\n",
                "webhook_secret": "whsec", "client_id": "Iv1.x", "client_secret": "csec"}


def _start(client, **params):
    r = client.get("/api/setup", params=params)
    state = r.text.split("?state=")[1].split("'")[0]
    return r, state


def test_disabled_when_app_configured(client, monkeypatch):
    monkeypatch.setattr(settings, "github_app_id", "123")
    assert client.get("/api/setup").status_code == 404
    assert client.get("/api/setup/callback?code=c&state=s").status_code == 404


def test_form_manifest_and_org_target(client):
    r, _ = _start(client)
    assert "action='https://github.com/settings/apps/new?state=" in r.text
    m = json.loads(unescape(r.text.split("name=manifest value='")[1].split("'>")[0]))
    assert m["hook_attributes"]["url"] == "https://triage.example.com/api/github/webhook"
    assert m["redirect_url"] == "https://triage.example.com/api/setup/callback"
    assert m["callback_urls"] == ["https://dash.example.com/api/auth/callback"]
    assert m["default_permissions"]["contents"] == "read" and m["public"] is False
    assert m["name"] == "Jev Triage (triage.example.com)"
    assert "github.com/organizations/acme/settings/apps/new" in client.get("/api/setup?org=acme").text
    assert client.get("/api/setup?org=a/../b").status_code == 400


def test_callback_rejects_bad_state(client, monkeypatch):
    monkeypatch.setattr(setup.httpx, "post", lambda *a, **k: pytest.fail("must not call GitHub"))
    assert client.get("/api/setup/callback?code=c&state=x").status_code == 400  # no cookie
    _start(client)
    assert client.get("/api/setup/callback?code=c&state=wrong").status_code == 400


def test_callback_writes_env(client, monkeypatch, tmp_path):
    env = tmp_path / ".env"
    env.write_text("DRY_RUN=true")  # no trailing newline
    calls = []
    monkeypatch.setattr(setup.httpx, "post", lambda url, **k: calls.append(url) or Resp())
    _, state = _start(client)
    r = client.get("/api/setup/callback", params={"code": "abc123", "state": state})
    assert r.status_code == 200
    assert calls == ["https://api.github.com/app-manifests/abc123/conversions"]
    lines = env.read_text().splitlines()
    assert lines[0] == "DRY_RUN=true"
    assert "GITHUB_APP_ID=42" in lines and "GITHUB_APP_SLUG=jev-triage-x" in lines
    assert "GITHUB_PRIVATE_KEY=-----BEGIN-----\\nabc\\n-----END-----" in lines
    assert "GITHUB_WEBHOOK_SECRET=whsec" in lines and "GITHUB_CLIENT_SECRET=csec" in lines
    assert "docker compose restart api worker" in r.text
    assert "https://github.com/apps/jev-triage-x/installations/new" in r.text


def test_callback_unwritable_env_shows_values(client, monkeypatch, tmp_path):
    monkeypatch.setenv("SETUP_ENV_PATH", str(tmp_path))  # a directory
    monkeypatch.setattr(setup.httpx, "post", lambda *a, **k: Resp())
    _, state = _start(client)
    r = client.get("/api/setup/callback", params={"code": "c", "state": state})
    assert "GITHUB_WEBHOOK_SECRET=whsec" in r.text


def test_callback_github_error(client, monkeypatch):
    class Bad:
        status_code = 404

    monkeypatch.setattr(setup.httpx, "post", lambda *a, **k: Bad())
    _, state = _start(client)
    assert client.get("/api/setup/callback", params={"code": "c", "state": state}).status_code == 502


def test_html_is_escaped(client, monkeypatch, tmp_path):
    class Evil(Resp):
        def json(self):
            return {**super().json(), "slug": "<script>x</script>"}

    monkeypatch.setenv("SETUP_ENV_PATH", str(tmp_path))
    monkeypatch.setattr(setup.httpx, "post", lambda *a, **k: Evil())
    _, state = _start(client)
    assert "<script>" not in client.get("/api/setup/callback", params={"code": "c", "state": state}).text
