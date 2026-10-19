"""All GitHub writes. Each call records an `actions` row; settings.dry_run (or demo mode) records without writing."""
import httpx
from psycopg.types.json import Jsonb

from app import db
from app.github import client_for
from app.settings import settings


def _dry() -> bool:
    return settings.dry_run or settings.demo_mode


def _record(item, repo, decision_id, kind, ref, **payload) -> None:
    db.execute(
        "INSERT INTO actions (item_id, repo_id, decision_id, kind, github_ref, payload) VALUES (%s, %s, %s, %s, %s, %s)",
        (item["id"] if item else None, repo["id"], decision_id, kind, ref, Jsonb({**payload, "dry_run": _dry()})))


def _ref(item, repo) -> str:
    return f"{repo['full_name']}#{item['github_number']}"


def label(item: dict, repo: dict, labels: list[str], decision_id: int | None) -> None:
    if not labels:
        return
    if not _dry():
        client_for(repo).add_labels(repo["full_name"], item["github_number"], labels)
    _record(item, repo, decision_id, "label", _ref(item, repo), labels=labels)


def unlabel(item: dict, repo: dict, label: str, decision_id: int | None) -> None:
    if not _dry():
        client_for(repo).remove_label(repo["full_name"], item["github_number"], label)
    _record(item, repo, decision_id, "unlabel", _ref(item, repo), label=label)


def assign(item: dict, repo: dict, logins: list[str], decision_id: int | None) -> None:
    if not logins:
        return
    if not _dry():
        client_for(repo).add_assignees(repo["full_name"], item["github_number"], logins)
    _record(item, repo, decision_id, "assign", _ref(item, repo), logins=logins)


def comment(item: dict, repo: dict, body: str, decision_id: int | None, key: str) -> None:
    """Post once per (item, key); a repeat edits the earlier comment. A key sharing the prefix before ':' edits it too."""
    body = body.rstrip() + f"\n\n---\n<sub>OSS Inbox · [why this comment?]({settings.dashboard_url.rstrip('/')}/items/{item['id']})</sub>"
    comment_id = None
    if not _dry():
        gh, full = client_for(repo), repo["full_name"]
        rows = db.fetch_all("SELECT key, github_comment_id FROM comment_state WHERE item_id = %s AND github_comment_id IS NOT NULL",
                            (item["id"],))
        prefix = key.split(":")[0]
        prev = next((r for r in rows if r["key"] == key), None) or next((r for r in rows if r["key"].split(":")[0] == prefix), None)
        if prev:
            try:
                comment_id = gh.update_comment(full, prev["github_comment_id"], body)["id"]
            except httpx.HTTPStatusError as e:
                if e.response.status_code != 404:  # 404: a maintainer deleted it, post a fresh one
                    raise
        if comment_id is None:
            comment_id = gh.create_comment(full, item["github_number"], body)["id"]
        db.execute("INSERT INTO comment_state (item_id, key, github_comment_id) VALUES (%s, %s, %s) "
                   "ON CONFLICT (item_id, key) DO UPDATE SET github_comment_id = EXCLUDED.github_comment_id",
                   (item["id"], key, comment_id))
    _record(item, repo, decision_id, "comment", _ref(item, repo), key=key, comment_id=comment_id, body=body)


def file_issue(repo: dict, title: str, body: str, labels: list[str], decision_id: int | None) -> dict:
    issue = {"number": None, "html_url": None} if _dry() else \
        client_for(repo).create_issue(repo["full_name"], title, body, labels)
    ref = f"{repo['full_name']}#{issue['number']}" if issue["number"] else None
    _record(None, repo, decision_id, "file_issue", ref, title=title, labels=labels, number=issue["number"])
    return issue


def check_run(item: dict, repo: dict, head_sha: str, title: str, summary_md: str, decision_id: int | None) -> None:
    """One neutral "OSS Inbox" check per head sha: later calls update the first."""
    check_id = None
    if not _dry():
        gh, full = client_for(repo), repo["full_name"]
        fields = dict(name="OSS Inbox", status="completed", conclusion="neutral",
                      output={"title": title, "summary": summary_md[:65000]})
        prev = db.fetch_one(
            "SELECT payload->>'check_run_id' AS id FROM actions WHERE repo_id = %s AND kind = 'check_run' "
            "AND payload->>'head_sha' = %s AND payload->>'check_run_id' IS NOT NULL ORDER BY id DESC LIMIT 1",
            (repo["id"], head_sha))
        run = gh.update_check_run(full, int(prev["id"]), **fields) if prev else gh.create_check_run(full, head_sha, **fields)
        check_id = run["id"]
    _record(item, repo, decision_id, "check_run", f"{repo['full_name']}@{head_sha[:7]}",
            head_sha=head_sha, check_run_id=check_id, title=title)
