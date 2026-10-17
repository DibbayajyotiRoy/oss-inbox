"""GitHub App installation lifecycle: keep orgs/repos rows in sync with what the App can see."""
import re

import httpx

from app import db
from app.github import GitHubClient, client_for
from app.repo_config import DEFAULT_LABELS, load

_UPSERT_REPO = """
INSERT INTO repos (org_id, github_repo_id, full_name, private, enabled, default_branch, description)
VALUES (%(org)s, %(id)s, %(name)s, %(private)s, NOT %(private)s, COALESCE(%(branch)s, 'main'), COALESCE(%(desc)s, ''))
ON CONFLICT (github_repo_id) DO UPDATE SET
  org_id = EXCLUDED.org_id, full_name = EXCLUDED.full_name,
  enabled = repos.enabled AND (NOT EXCLUDED.private OR repos.private),  -- turning private switches Jev off
  private = EXCLUDED.private,
  default_branch = COALESCE(%(branch)s, repos.default_branch), description = COALESCE(%(desc)s, repos.description)
RETURNING id"""


def handle_installation(event: str, payload: dict) -> None:
    """`event` is the webhook event name ("installation", "installation_repositories"); action comes from the payload."""
    name, _, suffix = event.partition(".")
    action = payload.get("action") or suffix
    inst = payload["installation"]
    if name == "installation" and action == "deleted":
        db.execute("DELETE FROM orgs WHERE github_installation_id = %s", (inst["id"],))  # cascades to everything
        return
    acct = inst["account"]
    org = db.fetch_one(
        "INSERT INTO orgs (github_installation_id, login, avatar_url) VALUES (%s, %s, %s) "
        "ON CONFLICT (github_installation_id) DO UPDATE SET login = EXCLUDED.login, avatar_url = EXCLUDED.avatar_url "
        "RETURNING id", (inst["id"], acct["login"], acct.get("avatar_url")))
    if name == "installation_repositories":
        if removed := [r["id"] for r in payload.get("repositories_removed", [])]:
            db.execute("DELETE FROM repos WHERE org_id = %s AND github_repo_id = ANY(%s)", (org["id"], removed))
        repos = payload.get("repositories_added", [])
    elif action in ("created", "unsuspend", "new_permissions_accepted"):
        repos = payload.get("repositories")
    else:  # suspend
        return
    if repos is None or any("default_branch" not in r for r in repos):  # webhook repo stubs lack branch/description
        try:
            full = {r["id"]: r for r in GitHubClient(inst["id"]).paginate("/installation/repositories")}
        except httpx.HTTPError:
            full = {}
        repos = [full.get(r["id"], r) for r in repos] if repos is not None else list(full.values())
    from app.jobs import enqueue  # lazy: app.jobs imports handlers that import this module

    for r in repos:
        row = db.fetch_one(_UPSERT_REPO, {"org": org["id"], "id": r["id"], "name": r["full_name"], "private": bool(r.get("private")),
                                          "branch": r.get("default_branch"), "desc": r.get("description")})
        enqueue("sync_repo", repo_id=row["id"])


def _norm(label: str) -> str:
    """'type: bug' / 'kind/bug' / 'Bug' -> 'bug'; 'Needs Info' -> 'needs-info'."""
    return re.sub(r"[\s_]+", "-", re.split(r"[:/]", label)[-1].strip().lower())


def propose_label_map(existing: list[str]) -> dict:
    """Map the repo's existing labels onto Jev's defaults; shaped like RepoConfig.labels, only entries that differ."""
    out: dict = {}
    for key, v in DEFAULT_LABELS.items():
        for answer, default in v.items() if isinstance(v, dict) else [(None, v)]:
            if default in existing:
                continue
            names = {_norm(default), _norm(answer or default)}
            if hit := next((e for e in existing if _norm(e) in names), None):
                if answer:
                    out.setdefault(key, {})[answer] = hit
                else:
                    out[key] = hit
    return out


def ensure_labels(repo_row: dict) -> list[str]:
    cfg = load(repo_row)
    wanted = [x for v in cfg.labels.values() for x in (v.values() if isinstance(v, dict) else [v])]
    wanted += [cfg.label("route.area", a) for a in cfg.areas]
    gh, full = client_for(repo_row), repo_row["full_name"]
    have = {n.lower() for n in gh.list_labels(full)}
    created = []
    for name in dict.fromkeys(x for x in wanted if x):
        if name.lower() in have:
            continue
        try:
            gh.create_label(full, name)
        except httpx.HTTPStatusError as e:
            if e.response.status_code != 422:  # 422: created concurrently
                raise
        created.append(name)
    return created
