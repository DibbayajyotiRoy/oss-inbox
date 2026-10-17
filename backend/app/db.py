import atexit
from contextlib import contextmanager
from pathlib import Path

from psycopg.rows import dict_row
from psycopg_pool import ConnectionPool

from app.settings import settings

_pool: ConnectionPool | None = None


def pool() -> ConnectionPool:
    global _pool
    if _pool is None:
        _pool = ConnectionPool(settings.database_url, kwargs={"row_factory": dict_row}, min_size=1, max_size=10, open=True)
        atexit.register(_pool.close)
    return _pool


@contextmanager
def transaction():
    with pool().connection() as conn:
        with conn.transaction():
            yield conn


def fetch_one(sql, params=None):
    with transaction() as c:
        return c.execute(sql, params).fetchone()


def fetch_all(sql, params=None):
    with transaction() as c:
        return c.execute(sql, params).fetchall()


def execute(sql, params=None) -> int:
    with transaction() as c:
        return c.execute(sql, params).rowcount


def init_schema() -> None:
    with transaction() as c:
        c.execute("SELECT pg_advisory_xact_lock(4242)")  # api + worker may start together
        c.execute((Path(__file__).parent.parent / "schema.sql").read_text())
