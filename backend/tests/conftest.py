import os

os.environ["DATABASE_URL"] = os.environ.get("TEST_DATABASE_URL", "postgresql://jev:jev@localhost:55432/jev")
os.environ["REDIS_URL"] = os.environ.get("TEST_REDIS_URL", "redis://localhost:56379/15")
os.environ.setdefault("GITHUB_WEBHOOK_SECRET", "test-secret")
os.environ.setdefault("SESSION_SECRET", "test-session")

import pytest  # noqa: E402

from app import db  # noqa: E402
from app.redis_client import redis  # noqa: E402

db.init_schema()
_TABLES = [r["tablename"] for r in db.fetch_all("SELECT tablename FROM pg_tables WHERE schemaname='public'")]


@pytest.fixture(autouse=True)
def _clean():
    db.execute(f"TRUNCATE {', '.join(_TABLES)} RESTART IDENTITY CASCADE")
    redis.flushdb()
    yield


@pytest.fixture
def org():
    return db.fetch_one("INSERT INTO orgs (github_installation_id, login) VALUES (1001, 'acme') RETURNING *")


@pytest.fixture
def repo(org):
    return db.fetch_one(
        "INSERT INTO repos (org_id, github_repo_id, full_name, enabled) VALUES (%s, 2001, 'acme/widgets', true) RETURNING *",
        (org["id"],),
    )
