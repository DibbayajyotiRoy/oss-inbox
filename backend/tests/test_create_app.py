import json
import socket
import stat
import threading
import time
import urllib.error
import urllib.request
from html import unescape

import pytest

from app import cli

SECRETS = ("whsec", "csec", "BEGIN")


class Resp:
    status_code = 201

    def json(self):
        return {"id": 42, "slug": "oss-inbox-x", "pem": "-----BEGIN-----\nabc\n-----END-----\n",
                "webhook_secret": "whsec", "client_id": "Iv1.x", "client_secret": "csec"}


class Run:
    """cli.main(['create-app', ...]) in a thread on a free port; the test plays the browser."""

    def __init__(self, monkeypatch, tmp_path, *extra):
        with socket.socket() as s:
            s.bind(("127.0.0.1", 0))
            monkeypatch.setattr(cli, "PORT", s.getsockname()[1])
        monkeypatch.setattr(cli.webbrowser, "open", lambda url: True)
        self.out, self.rc, self.posts = tmp_path / "creds", [], []
        monkeypatch.setattr("httpx.post", lambda url, **k: self.posts.append(url) or self.resp)
        self.resp = Resp()
        args = ["create-app", "--public-url", "https://api.example.com/", "--dashboard-url", "https://dash.example.com", "--out", str(self.out), *extra]
        self.thread = threading.Thread(target=lambda: self.rc.append(cli.main(args)), daemon=True)
        self.thread.start()

    def get(self, path):
        for _ in range(100):
            try:
                with urllib.request.urlopen(f"http://127.0.0.1:{cli.PORT}{path}") as r:
                    return r.status, r.read().decode()
            except urllib.error.HTTPError as e:
                return e.code, e.read().decode()
            except urllib.error.URLError:
                time.sleep(0.05)  # server not up yet
        raise AssertionError("server never came up")

    def form(self):
        page = self.get("/")[1]
        return page.split("action='")[1].split("'")[0], json.loads(unescape(page.split("name=manifest value='")[1].split("'>")[0]))


def test_creates_app_and_writes_credentials(monkeypatch, tmp_path, capsys):
    run = Run(monkeypatch, tmp_path)
    action, m = run.form()
    state = action.split("state=")[1]
    assert action.startswith("https://github.com/settings/apps/new?state=")
    assert m["hook_attributes"]["url"] == "https://api.example.com/api/github/webhook"
    assert m["callback_urls"] == ["https://dash.example.com/api/auth/callback"] and m["setup_url"] == "https://dash.example.com"
    assert m["redirect_url"] == f"http://127.0.0.1:{cli.PORT}/callback"
    assert m["public"] is False and m["default_permissions"]["contents"] == "read" and m["default_events"] == ["issues", "pull_request", "push"]
    assert run.get("/callback?code=abc&state=wrong")[0] == 400 and run.get("/callback?code=abc")[0] == 400
    assert run.posts == []  # a forged callback never reaches GitHub
    assert run.get(f"/callback?code=abc&state={state}")[0] == 200
    run.thread.join(5)
    assert run.rc == [0] and run.posts == ["https://api.github.com/app-manifests/abc/conversions"]
    lines = run.out.read_text().splitlines()
    assert lines == ["GITHUB_APP_ID=42", "GITHUB_APP_SLUG=oss-inbox-x", "GITHUB_PRIVATE_KEY=-----BEGIN-----\\nabc\\n-----END-----",
                     "GITHUB_WEBHOOK_SECRET=whsec", "GITHUB_CLIENT_ID=Iv1.x", "GITHUB_CLIENT_SECRET=csec"]
    assert stat.S_IMODE(run.out.stat().st_mode) == 0o600
    cap = capsys.readouterr()
    assert "https://github.com/apps/oss-inbox-x/installations/new" in cap.out
    assert not any(s in cap.out + cap.err for s in SECRETS)


def test_org_and_name(monkeypatch, tmp_path):
    run = Run(monkeypatch, tmp_path, "--org", "acme", "--name", "My Triage")
    action, m = run.form()
    assert action.startswith("https://github.com/organizations/acme/settings/apps/new?state=") and m["name"] == "My Triage"
    run.get(f"/callback?code=c&state={action.split('state=')[1]}")
    run.thread.join(5)


def test_github_rejects_code(monkeypatch, tmp_path, capsys):
    run = Run(monkeypatch, tmp_path)
    run.resp.status_code = 404
    run.get(f"/callback?code=c&state={run.form()[0].split('state=')[1]}")
    run.thread.join(5)
    assert run.rc == [1] and not run.out.exists() and "HTTP 404" in capsys.readouterr().err


def test_rejects_bad_org(tmp_path):
    with pytest.raises(SystemExit):
        cli.main(["create-app", "--public-url", "https://a", "--dashboard-url", "https://b", "--org", "a/../b"])
