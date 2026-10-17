"""GitHub App auth and a thin sync REST/GraphQL client."""
import base64
import hashlib
import hmac
import json
import time
from collections.abc import Iterator
from datetime import datetime, timezone
from typing import Any
from urllib.parse import quote

import httpx
import jwt

from app import db
from app.redis_client import redis
from app.settings import settings

API = "https://api.github.com"
_transport: httpx.BaseTransport | None = None  # tests inject httpx.MockTransport
_ROLES = {"admin", "maintain", "write", "triage", "read"}
_ORIGINAL_BODY = """query($owner: String!, $name: String!, $number: Int!) {
  repository(owner: $owner, name: $name) { issueOrPullRequest(number: $number) {
    ... on Issue { userContentEdits(first: 100) { nodes { editedAt diff } } }
    ... on PullRequest { userContentEdits(first: 100) { nodes { editedAt diff } } }
  } } }"""


def _http() -> httpx.Client:
    return httpx.Client(base_url=API, timeout=20, transport=_transport, headers={
        "Accept": "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28"})


def _wait(r: httpx.Response, attempt: int) -> float | None:
    """Seconds to sleep before retrying this response, or None if it isn't retryable."""
    h = r.headers
    if r.status_code >= 500:
        return 2**attempt
    if r.status_code in (403, 429):
        if "retry-after" in h:
            return min(30, int(h["retry-after"]))
        if h.get("x-ratelimit-remaining") == "0" and "x-ratelimit-reset" in h:
            return min(30, max(0, int(h["x-ratelimit-reset"]) - time.time()))
        if r.status_code == 429:
            return 2**attempt
    return None


def _send(http: httpx.Client, method: str, path: str, token: str, **kw) -> httpx.Response:
    for attempt in range(4):  # first try + 3 retries
        r = http.request(method, path, headers={"Authorization": f"Bearer {token}"}, **kw)
        wait = _wait(r, attempt)
        if wait is None or attempt == 3:
            return r
        time.sleep(wait)


def app_jwt() -> str:
    now = int(time.time())
    return jwt.encode({"iat": now - 60, "exp": now + 540, "iss": settings.github_app_id},
                      settings.github_private_key, algorithm="RS256")


def _token_key(installation_id: int) -> str:
    return f"gh:token:{installation_id}"


def installation_token(installation_id: int) -> str:
    if tok := redis.get(_token_key(installation_id)):
        return tok
    with _http() as http:
        r = _send(http, "POST", f"/app/installations/{installation_id}/access_tokens", app_jwt())
    r.raise_for_status()
    d = r.json()
    ttl = int((datetime.fromisoformat(d["expires_at"]) - datetime.now(timezone.utc)).total_seconds()) - 300
    if ttl > 0:
        redis.set(_token_key(installation_id), d["token"], ex=ttl)
    return d["token"]


def verify_signature(body: bytes, header: str | None) -> bool:
    if not header or not settings.github_webhook_secret:
        return False
    mac = hmac.new(settings.github_webhook_secret.encode(), body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(f"sha256={mac}".encode(), header.encode())


class GitHubClient:
    def __init__(self, installation_id: int):
        self.installation_id = installation_id
        self._http = _http()

    def _send(self, method: str, path: str, **kw) -> httpx.Response:
        r = _send(self._http, method, path, installation_token(self.installation_id), **kw)
        if r.status_code == 401:  # cached token was revoked early
            redis.delete(_token_key(self.installation_id))
            r = _send(self._http, method, path, installation_token(self.installation_id), **kw)
        return r

    def request(self, method: str, path: str, ok: tuple[int, ...] = (), **kw) -> Any:
        """JSON body, or None for an empty body or a status listed in `ok`; other errors raise."""
        r = self._send(method, path, **kw)
        if r.status_code in ok:
            return None
        r.raise_for_status()
        return r.json() if r.content else None

    def paginate(self, path: str, params: dict | None = None, max_items: int | None = None) -> Iterator[dict]:
        params, n = {"per_page": 100, **(params or {})}, 0
        while path:
            r = self._send("GET", path, params=params)
            r.raise_for_status()
            data = r.json()
            if isinstance(data, dict):  # search / installation listings wrap the array
                data = next((v for v in data.values() if isinstance(v, list)), [])
            for item in data:
                if max_items is not None and n >= max_items:
                    return
                n += 1
                yield item
            path, params = r.links.get("next", {}).get("url"), None

    def graphql(self, query: str, variables: dict) -> dict:
        d = self.request("POST", "/graphql", json={"query": query, "variables": variables})
        if not d.get("data"):
            raise RuntimeError(f"GitHub GraphQL error: {d.get('errors')}")
        return d["data"]

    def add_labels(self, repo, number, labels):
        return self.request("POST", f"/repos/{repo}/issues/{number}/labels", json={"labels": labels})

    def remove_label(self, repo, number, label):
        self.request("DELETE", f"/repos/{repo}/issues/{number}/labels/{quote(label, safe='')}", ok=(404,))

    def list_labels(self, repo) -> list[str]:
        return [x["name"] for x in self.paginate(f"/repos/{repo}/labels")]

    def create_label(self, repo, name, color="ededed", description=""):
        return self.request("POST", f"/repos/{repo}/labels",
                            json={"name": name, "color": color, "description": description})

    def create_comment(self, repo, number, body) -> dict:
        return self.request("POST", f"/repos/{repo}/issues/{number}/comments", json={"body": body})

    def update_comment(self, repo, comment_id, body) -> dict:
        return self.request("PATCH", f"/repos/{repo}/issues/comments/{comment_id}", json={"body": body})

    def create_issue(self, repo, title, body, labels) -> dict:
        return self.request("POST", f"/repos/{repo}/issues", json={"title": title, "body": body, "labels": labels})

    def add_assignees(self, repo, number, logins):
        return self.request("POST", f"/repos/{repo}/issues/{number}/assignees", json={"assignees": logins})

    def create_check_run(self, repo, head_sha, **fields) -> dict:
        return self.request("POST", f"/repos/{repo}/check-runs", json={"head_sha": head_sha, **fields})

    def update_check_run(self, repo, check_run_id, **fields) -> dict:
        return self.request("PATCH", f"/repos/{repo}/check-runs/{check_run_id}", json=fields)

    def get_file(self, repo, path, ref=None) -> tuple[str, str] | None:
        d = self.request("GET", f"/repos/{repo}/contents/{quote(path)}", ok=(404,), params={"ref": ref} if ref else None)
        if not isinstance(d, dict) or not d.get("content"):  # missing, a directory, or over 1 MB
            return None
        return base64.b64decode(d["content"]).decode(errors="replace"), d["sha"]

    def get_tree_paths(self, repo, ref="HEAD") -> set[str]:
        key = f"gh:tree:{repo}:{ref}"
        if (cached := redis.get(key)) is not None:
            return set(json.loads(cached))
        d = self.request("GET", f"/repos/{repo}/git/trees/{ref}", ok=(404, 409), params={"recursive": 1})  # 409: empty repo
        paths = [t["path"] for t in (d or {}).get("tree", []) if t["type"] == "blob"]
        redis.set(key, json.dumps(paths), ex=3600)
        return set(paths)

    def get_pr_files(self, repo, number) -> list[dict]:
        return list(self.paginate(f"/repos/{repo}/pulls/{number}/files"))

    def search_issues(self, q, max_items=10) -> list[dict]:
        return list(self.paginate("/search/issues", {"q": q, "per_page": min(max_items, 100)}, max_items))

    def original_body(self, repo, number) -> str | None:
        owner, name = repo.split("/", 1)
        d = self.graphql(_ORIGINAL_BODY, {"owner": owner, "name": name, "number": number})
        node = (d.get("repository") or {}).get("issueOrPullRequest") or {}
        # ponytail: first 100 edits only; an item edited more than 100 times returns a later edit
        edits = [n for n in (node.get("userContentEdits") or {}).get("nodes") or [] if n]
        return min(edits, key=lambda n: n["editedAt"])["diff"] if edits else None

    def timeline(self, repo, number) -> list[dict]:
        return list(self.paginate(f"/repos/{repo}/issues/{number}/timeline"))

    def permission(self, repo, login) -> str | None:
        d = self.request("GET", f"/repos/{repo}/collaborators/{quote(login)}/permission", ok=(404,))
        if d is None:
            return None
        return d["role_name"] if d.get("role_name") in _ROLES else d.get("permission")


def installation_for_repo(repo_row: dict) -> int:
    row = db.fetch_one("SELECT o.github_installation_id FROM repos r JOIN orgs o ON o.id = r.org_id WHERE r.id = %s",
                       (repo_row["id"],))
    return row["github_installation_id"]


class _DemoClient:
    """DEMO_MODE stand-in: reads return seed-like data, writes are no-ops (actions are forced dry-run anyway)."""
    _GITHUB_DEFAULTS = ["bug", "documentation", "duplicate", "enhancement", "good first issue", "help wanted", "invalid",
                        "question", "wontfix"]

    def list_labels(self, repo) -> list[str]:
        from app.repo_config import RepoConfig, wanted_labels

        row = db.fetch_one("SELECT enabled, config FROM repos WHERE full_name = %s", (repo,))
        # enabled demo repos are fully onboarded; the disabled one still has only GitHub's stock labels
        return self._GITHUB_DEFAULTS + (wanted_labels(RepoConfig.model_validate(row["config"])) if row and row["enabled"] and row["config"] else [])

    def create_label(self, *a, **k) -> None:
        return None

    def get_file(self, *a, **k) -> None:
        return None

    def get_tree_paths(self, *a, **k) -> set[str]:
        return set()

    def permission(self, *a, **k) -> str:
        return "admin"


def client_for(repo_row: dict) -> GitHubClient:
    if settings.demo_mode:
        return _DemoClient()
    return GitHubClient(installation_for_repo(repo_row))
