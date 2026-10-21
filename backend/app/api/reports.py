"""POST /api/v1/reports: CI agents (and external reporters) submit failures/reports with a per-repo bearer token."""
import hashlib
from typing import Literal

from fastapi import APIRouter, Header, HTTPException
from psycopg.types.json import Jsonb
from pydantic import BaseModel, Field

from app import db, ratelimit
from app.features import ci_gate

router = APIRouter()


class Report(BaseModel):
    repo: str = Field(max_length=200)
    title: str = Field(min_length=1, max_length=256)
    body: str = Field(default="", max_length=65_000)
    failing_test: str | None = Field(default=None, max_length=512)
    log_excerpt: str | None = Field(default=None, max_length=20_000)
    commit_sha: str | None = Field(default=None, pattern=r"^[0-9a-fA-F]{7,64}$")
    run_url: str | None = Field(default=None, max_length=1024, pattern=r"^https?://\S+$")
    source: Literal["ci", "external"] = "ci"


@router.post("/api/v1/reports")
def create_report(body: Report, authorization: str | None = Header(default=None)):
    scheme, _, token = (authorization or "").partition(" ")
    row = scheme.lower() == "bearer" and token.strip() and db.fetch_one(
        """SELECT r.id, r.full_name, r.enabled FROM ci_tokens t JOIN repos r ON r.id = t.repo_id
           WHERE t.token_hash = %s AND t.revoked_at IS NULL""", (hashlib.sha256(token.strip().encode()).hexdigest(),))
    if not row:
        raise HTTPException(401, "invalid or revoked token", headers={"WWW-Authenticate": "Bearer"})
    if row["full_name"].lower() != body.repo.lower():
        raise HTTPException(403, "token is not valid for this repository")
    if not row["enabled"]:
        raise HTTPException(403, "repository is not enabled")
    if not ratelimit.allow(f"reports:{row['id']}", 120, 60):
        raise HTTPException(429, "rate limit exceeded (120 requests/minute)", headers={"Retry-After": "60"})
    return submit(row, body)


def submit(row: dict, body: Report) -> dict:
    """Store a report for an already-authorised repo row and run the CI gate on it (also used by the MCP submit_report tool)."""
    ci = body.source == "ci"
    with db.transaction() as c:
        report_id = c.execute("INSERT INTO ci_reports (repo_id, source, payload) VALUES (%s, %s, %s) RETURNING id",
                              (row["id"], body.source, Jsonb(body.model_dump()))).fetchone()["id"]
        item_id = c.execute(
            "INSERT INTO items (repo_id, kind, title, body, source, extra) VALUES (%s, %s, %s, %s, %s, %s) RETURNING id",
            (row["id"], "ci_report" if ci else "report", body.title, body.body, "ci_agent" if ci else "external",
             Jsonb(body.model_dump(include={"failing_test", "commit_sha", "run_url"})))).fetchone()["id"]
        c.execute("UPDATE ci_reports SET item_id = %s WHERE id = %s", (item_id, report_id))
    return ci_gate.process_report(report_id)
