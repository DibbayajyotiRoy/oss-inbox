"""Similar-item lookup: Postgres FTS over items.search, topped up from GitHub search when the repo has an installation."""
import logging
import re

from app import db

log = logging.getLogger(__name__)

_STOP = set("""this that with from have were been what when where which there their would could should about after
before because these those into your does will just than then also only some them they here very much more most
other such like over same each both being while still even""".split())
_COLS = ("i.id, i.repo_id, i.kind, i.github_number, i.title, i.body, i.author, i.author_association, "
         "i.html_url, i.state, i.source, i.extra, i.created_at, i.updated_at")


def words(text: str, n: int = 30) -> list[str]:
    seen = dict.fromkeys(w for w in re.findall(r"[a-z0-9]+", text.lower()) if len(w) > 3 and w not in _STOP)
    return list(seen)[:n]


def _from_github(repo_id: int, ws: list[str], k: int, open_only: bool) -> None:
    """Upsert GitHub search hits not yet stored, so they get ids. Any failure -> local results only."""
    try:
        from app.github import client_for
        from app.pipeline import upsert_item

        repo = db.fetch_one("SELECT * FROM repos WHERE id = %s", (repo_id,))
        q = f"repo:{repo['full_name']} is:issue {'is:open ' if open_only else ''}{' '.join(ws[:6])}"
        hits = client_for(repo).search_issues(q, max_items=k)
        have = {r["github_number"] for r in db.fetch_all(
            "SELECT github_number FROM items WHERE repo_id = %s AND kind = 'issue' AND github_number = ANY(%s)",
            (repo_id, [h["number"] for h in hits]))}
        for h in hits:
            if h["number"] not in have:
                upsert_item(repo, "issue", h["number"], h.get("title") or "", h.get("body") or "",
                            (h.get("user") or {}).get("login"), h.get("author_association"), h.get("html_url"),
                            "backfill", state=h.get("state", "open"), created_at=h.get("created_at"))
    except Exception as e:
        log.warning("github search skipped: %s", e)


def similar(repo_id: int, text: str, k: int = 10, exclude_item_id: int | None = None,
            kinds: tuple[str, ...] = ("issue",), open_only: bool = True) -> list[dict]:
    ws = words(text)
    if not ws:
        return []
    if "issue" in kinds:
        _from_github(repo_id, ws, k, open_only)
    # GitHub hits are now local rows, so one scored query covers both sources and dedupes by construction
    return db.fetch_all(
        f"""SELECT {_COLS}, ts_rank(i.search, q) AS score
            FROM items i, websearch_to_tsquery('english', %(q)s) q
            WHERE i.repo_id = %(repo)s AND i.kind = ANY(%(kinds)s) AND i.search @@ q
              AND (NOT %(open)s OR i.state = 'open') AND i.id IS DISTINCT FROM %(ex)s
            ORDER BY score DESC, i.id DESC LIMIT %(k)s""",
        {"q": " OR ".join(ws), "repo": repo_id, "kinds": list(kinds), "open": open_only, "ex": exclude_item_id, "k": k})
