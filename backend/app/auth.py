"""GitHub App user OAuth. The dashboard proxies /api/*, so cookies live on the dashboard origin."""
import secrets
from dataclasses import dataclass
from urllib.parse import urlencode

import httpx
from fastapi import APIRouter, HTTPException, Request, Response
from fastapi.responses import RedirectResponse
from itsdangerous import BadSignature, URLSafeTimedSerializer

from app import db
from app.redis_client import redis
from app.settings import settings

router = APIRouter()

SESSION_COOKIE = "jt_session"
STATE_COOKIE = "jt_state"
SESSION_TTL = 14 * 86400
ORDER = {"viewer": 0, "maintainer": 1, "admin": 2}
PERMISSION_ROLE = {"admin": "admin", "maintain": "maintainer", "write": "maintainer", "triage": "maintainer", "read": "viewer"}


@dataclass
class User:
    id: int
    login: str
    avatar_url: str
    token: str


def _signer(salt: str) -> URLSafeTimedSerializer:
    return URLSafeTimedSerializer(settings.session_secret, salt=salt)


def _cookie(resp: Response, name: str, value: str, max_age: int) -> None:
    resp.set_cookie(name, value, max_age=max_age, httponly=True, samesite="lax",
                    secure=settings.dashboard_url.startswith("https"))


def _unsign(request: Request, name: str, max_age: int) -> str | None:
    try:
        return _signer(name).loads(request.cookies.get(name, ""), max_age=max_age)
    except BadSignature:
        return None


@router.get("/api/auth/login")
def login():
    state = secrets.token_urlsafe(16)
    query = urlencode({"client_id": settings.github_client_id, "state": state,
                       "redirect_uri": f"{settings.dashboard_url}/api/auth/callback"})
    resp = RedirectResponse(f"https://github.com/login/oauth/authorize?{query}", status_code=302)
    _cookie(resp, STATE_COOKIE, _signer(STATE_COOKIE).dumps(state), 600)
    return resp


@router.get("/api/auth/callback")
def callback(request: Request, code: str = "", state: str = ""):
    expected = _unsign(request, STATE_COOKIE, 600)
    if not code or not expected or state != expected:
        raise HTTPException(400, "invalid login state, try again")
    try:
        token = httpx.post(
            "https://github.com/login/oauth/access_token",
            json={"client_id": settings.github_client_id, "client_secret": settings.github_client_secret, "code": code,
                  "redirect_uri": f"{settings.dashboard_url}/api/auth/callback"},
            headers={"Accept": "application/json"}, timeout=15,
        ).json().get("access_token")
        if not token:
            raise HTTPException(400, "GitHub rejected the login code")
        gh = httpx.get("https://api.github.com/user", timeout=15,
                       headers={"Authorization": f"Bearer {token}", "Accept": "application/vnd.github+json"})
        gh.raise_for_status()
    except httpx.HTTPError:
        raise HTTPException(502, "could not reach GitHub")
    u = gh.json()
    sid = secrets.token_urlsafe(32)
    db.execute("DELETE FROM sessions WHERE expires_at < now()")
    db.execute(
        "INSERT INTO sessions (id, github_user_id, login, avatar_url, token, expires_at) "
        "VALUES (%s, %s, %s, %s, %s, now() + make_interval(secs => %s))",
        (sid, u["id"], u["login"], u.get("avatar_url") or "", token, SESSION_TTL),
    )
    resp = RedirectResponse(settings.dashboard_url, status_code=302)
    _cookie(resp, SESSION_COOKIE, _signer(SESSION_COOKIE).dumps(sid), SESSION_TTL)
    resp.delete_cookie(STATE_COOKIE)
    return resp


@router.post("/api/auth/logout")
def logout(request: Request, response: Response):
    if sid := _unsign(request, SESSION_COOKIE, SESSION_TTL):
        db.execute("DELETE FROM sessions WHERE id = %s", (sid,))
    response.delete_cookie(SESSION_COOKIE)
    return {"ok": True}


def current_user(request: Request) -> User:
    sid = _unsign(request, SESSION_COOKIE, SESSION_TTL)
    row = sid and db.fetch_one("SELECT * FROM sessions WHERE id = %s AND expires_at > now()", (sid,))
    if not row:
        raise HTTPException(401, "not logged in")
    return User(row["github_user_id"], row["login"], row["avatar_url"], row["token"])


def role(user: User, repo_row: dict) -> str | None:
    key = f"jev:role:{repo_row['id']}:{user.id}"
    cached = redis.get(key)
    if cached is None:
        from app.github import client_for
        perm = client_for(repo_row).permission(repo_row["full_name"], user.login)
        cached = PERMISSION_ROLE.get(perm, "")  # "" caches "no access"
        redis.set(key, cached, ex=300)
    return cached or None


def require_repo(user: User, repo_id: int, min_role: str = "viewer") -> dict:
    """Repo row plus the caller's `role`. 404 unknown repo, 403 below min_role."""
    repo = db.fetch_one("SELECT * FROM repos WHERE id = %s", (repo_id,))
    if not repo:
        raise HTTPException(404, "repo not found")
    r = role(user, repo)
    if r is None or ORDER[r] < ORDER[min_role]:
        raise HTTPException(403, f"{min_role} access required")
    return {**repo, "role": r}
