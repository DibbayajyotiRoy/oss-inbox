from psycopg.types.json import Jsonb

from app import db


def log(org_id, repo_id, actor, action, target="", details=None) -> None:
    db.execute(
        "INSERT INTO audit_log (org_id, repo_id, actor, action, target, details) VALUES (%s, %s, %s, %s, %s, %s)",
        (org_id, repo_id, actor, action, target, Jsonb(details or {})),
    )
