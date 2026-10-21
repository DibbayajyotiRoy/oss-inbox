"""Bearer tokens for the MCP agent interface (`oi_...`, one repo each). Admin-only management over cookie auth.

An agent is never above `maintainer`: `AgentUser` carries the repo scope that `auth.role` honours, so every
dashboard function an MCP tool reuses enforces the same scope as for a human.
"""
import hashlib
import secrets
from dataclasses import dataclass
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from app import audit, auth, db
from app.settings import DEMO_ORG, settings

router = APIRouter()
UserDep = Annotated[auth.User, Depends(auth.current_user)]
PREFIX = "oi_"


@dataclass
class AgentUser(auth.User):
    """Who an MCP call acts as. `login` is `agent:<token name>`, which is the audit-log actor."""
    agent_repo_ids: frozenset[int] = frozenset()
    scopes: frozenset[str] = frozenset()
    token_id: int | None = None  # None = anonymous demo visitor
    rate_key: str = ""

    def can(self, scope: Literal["read", "write"]) -> bool:
        return scope in self.scopes or "write" in self.scopes  # write implies read


def _hash(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def authenticate(authorization: str | None, client: str = "") -> AgentUser | None:
    """`Bearer oi_...` -> the token's repo scope. No header in demo mode -> read-only access to demo-org repos.
    Returns None for a missing, unknown or revoked token (and for no header outside demo mode)."""
    scheme, _, token = (authorization or "").partition(" ")
    token = token.strip()
    if scheme.lower() == "bearer" and token:
        row = token.startswith(PREFIX) and db.fetch_one(
            """SELECT id, repo_id, name, scopes, last_used_at IS NULL OR last_used_at < now() - interval '1 minute' AS stale
               FROM agent_tokens WHERE token_hash = %s AND revoked_at IS NULL""", (_hash(token),))
        if not row:
            return None
        if row["stale"]:  # at most one write a minute per token
            db.execute("UPDATE agent_tokens SET last_used_at = now() WHERE id = %s", (row["id"],))
        return AgentUser(-row["id"], f"agent:{row['name']}", "", "", frozenset({row["repo_id"]}),
                         frozenset(row["scopes"]), row["id"], f"token:{row['id']}")
    if authorization or not settings.demo_mode:
        return None
    ids = db.fetch_all("SELECT r.id FROM repos r JOIN orgs o ON o.id = r.org_id WHERE o.login = %s", (DEMO_ORG,))
    return AgentUser(0, "agent:demo-visitor", "", "", frozenset(r["id"] for r in ids), frozenset({"read"}), None, f"anon:{client}")


@router.get("/api/repos/{repo_id}/agent-tokens")
def list_tokens(repo_id: int, user: UserDep):
    auth.require_repo(user, repo_id, "admin")
    return {"items": db.fetch_all("SELECT id, name, scopes, created_by, created_at, last_used_at, revoked_at FROM agent_tokens "
                                  "WHERE repo_id = %s ORDER BY id DESC", (repo_id,))}


class NewToken(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    scopes: list[Literal["read", "write"]] = Field(default=["read"], min_length=1)


@router.post("/api/repos/{repo_id}/agent-tokens")
def create_token(repo_id: int, body: NewToken, user: UserDep):
    repo = auth.require_repo(user, repo_id, "admin")
    token = PREFIX + secrets.token_urlsafe(32)
    scopes = sorted(set(body.scopes) | {"read"})  # a token that can write can always read
    row = db.fetch_one("INSERT INTO agent_tokens (repo_id, name, scopes, token_hash, created_by) VALUES (%s, %s, %s, %s, %s) RETURNING id",
                       (repo_id, body.name, scopes, _hash(token), user.login))
    audit.log(repo["org_id"], repo_id, user.login, "agent_token.create", body.name, {"token_id": row["id"], "scopes": scopes})
    return {"id": row["id"], "name": body.name, "scopes": scopes, "token": token}  # plaintext is never stored


@router.delete("/api/repos/{repo_id}/agent-tokens/{token_id}")
def revoke_token(repo_id: int, token_id: int, user: UserDep):
    repo = auth.require_repo(user, repo_id, "admin")
    row = db.fetch_one("UPDATE agent_tokens SET revoked_at = now() WHERE id = %s AND repo_id = %s AND revoked_at IS NULL "
                       "RETURNING name", (token_id, repo_id))
    if not row:
        raise HTTPException(404, "token not found")
    audit.log(repo["org_id"], repo_id, user.login, "agent_token.revoke", row["name"], {"token_id": token_id})
    return {"ok": True}
