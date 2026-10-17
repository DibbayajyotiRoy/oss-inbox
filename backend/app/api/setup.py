"""GitHub App manifest flow for self-hosters. Active only while GITHUB_APP_ID is unset.

/api/setup           form that POSTs the manifest to GitHub
/api/setup/callback  GitHub redirects here with ?code; we exchange it and append the credentials to .env
"""

import html
import json
import os
import re
import secrets
from pathlib import Path
from urllib.parse import quote, urlparse

import httpx
from fastapi import APIRouter, HTTPException, Query, Request
from fastapi.responses import HTMLResponse

from app.settings import settings

router = APIRouter()
COOKIE = "jev_setup_state"


def _page(title: str, body: str, status: int = 200) -> HTMLResponse:
    t = html.escape(title)
    return HTMLResponse(
        f"<!doctype html><meta charset=utf-8><meta name=viewport content='width=device-width,initial-scale=1'>"
        f"<title>{t}</title><style>body{{font:16px/1.5 system-ui;max-width:42rem;margin:3rem auto;padding:0 1rem}}"
        f"pre{{background:#f4f4f4;padding:1rem;overflow:auto}}button{{font:inherit;padding:.5rem 1rem}}</style>"
        f"<h1>{t}</h1>{body}",
        status_code=status,
    )


def _require_enabled() -> None:
    if settings.github_app_id:
        raise HTTPException(404)


def manifest() -> dict:
    host = urlparse(settings.public_url).hostname or "self-hosted"
    return {
        "name": f"Jev Triage ({host})"[:34],  # GitHub caps app names at 34 chars
        "url": settings.public_url,
        "hook_attributes": {"url": f"{settings.public_url}/api/github/webhook", "active": True},
        "redirect_url": f"{settings.public_url}/api/setup/callback",
        "callback_urls": [f"{settings.dashboard_url}/api/auth/callback"],
        "setup_url": settings.dashboard_url,
        "request_oauth_on_install": False,
        "public": False,
        "default_permissions": {
            "issues": "write",
            "pull_requests": "write",
            "checks": "write",
            "contents": "read",
            "metadata": "read",
        },
        "default_events": ["issues", "pull_request", "push"],  # installation events are always delivered
    }


@router.get("/api/setup")
def setup_form(org: str | None = Query(None)):
    _require_enabled()
    if org and not re.fullmatch(r"[A-Za-z0-9-]{1,39}", org):
        raise HTTPException(400, "invalid org")
    state = secrets.token_urlsafe(24)
    base = f"https://github.com/organizations/{org}/settings/apps/new" if org else "https://github.com/settings/apps/new"
    res = _page(
        "Create the Jev Triage GitHub App",
        f"<p>Creates a private GitHub App on {html.escape(org or 'your account')} with the permissions Jev Triage needs. "
        f"Credentials are written to your <code>.env</code>; nothing leaves this server except the request to GitHub.</p>"
        f"<form method=post action='{html.escape(base)}?state={html.escape(state)}'>"
        f"<input type=hidden name=manifest value='{html.escape(json.dumps(manifest()), quote=True)}'>"
        f"<button>Create GitHub App</button></form>",
    )
    res.set_cookie(COOKIE, state, max_age=3600, httponly=True, samesite="lax", secure=settings.public_url.startswith("https"))
    return res


def _write_env(values: dict[str, str]) -> bool:
    path = Path(os.environ.get("SETUP_ENV_PATH", ".env"))
    try:
        existing = path.read_bytes() if path.exists() else b""
        sep = "\n" if existing and not existing.endswith(b"\n") else ""
        with os.fdopen(os.open(path, os.O_WRONLY | os.O_APPEND | os.O_CREAT, 0o600), "a") as f:
            f.write(sep + "".join(f"{k}={v}\n" for k, v in values.items()))
        return True
    except OSError:
        return False


@router.get("/api/setup/callback")
def setup_callback(request: Request, code: str = Query(...), state: str = Query(...)):
    _require_enabled()
    cookie = request.cookies.get(COOKIE, "")
    if not cookie or not secrets.compare_digest(cookie, state):
        raise HTTPException(400, "state mismatch: start again at /api/setup")
    r = httpx.post(
        f"https://api.github.com/app-manifests/{quote(code, safe='')}/conversions",
        headers={"Accept": "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28"},
        timeout=20,
    )
    if r.status_code != 201:
        return _page("GitHub rejected the code", f"<p>HTTP {r.status_code}. Codes are single use and expire after an hour; start again at <a href='/api/setup'>/api/setup</a>.</p>", 502)
    d = r.json()
    values = {
        "GITHUB_APP_ID": str(d["id"]),
        "GITHUB_APP_SLUG": d["slug"],
        "GITHUB_PRIVATE_KEY": d["pem"].strip().replace("\n", "\\n"),
        "GITHUB_WEBHOOK_SECRET": d["webhook_secret"],
        "GITHUB_CLIENT_ID": d["client_id"],
        "GITHUB_CLIENT_SECRET": d["client_secret"],
    }
    if _write_env(values):
        saved = "<p>Credentials saved to your <code>.env</code>.</p>"
    else:
        lines = html.escape("".join(f"{k}={v}\n" for k, v in values.items()))
        saved = f"<p>Could not write the env file. Add these lines to your <code>.env</code> yourself (shown once):</p><pre>{lines}</pre>"
    install = f"https://github.com/apps/{quote(d['slug'])}/installations/new"
    res = _page(
        "GitHub App created",
        f"{saved}<ol><li>Restart with <code>docker compose restart api worker</code></li>"
        f"<li>Install the app: <a href='{html.escape(install)}'>{html.escape(install)}</a></li></ol>",
    )
    res.delete_cookie(COOKIE)
    return res
