import httpx
import pytest

from app import actions, db
from app.settings import settings


class FakeGH:
    def __init__(self):
        self.calls, self.next_id, self.gone = [], 100, set()

    def _rec(self, method, *a, **kw):
        self.calls.append((method, a, kw))

    def add_labels(self, *a):
        self._rec("add_labels", *a)

    def remove_label(self, *a):
        self._rec("remove_label", *a)

    def add_assignees(self, *a):
        self._rec("add_assignees", *a)

    def create_comment(self, repo, number, body):
        self._rec("create_comment", repo, number, body)
        self.next_id += 1
        return {"id": self.next_id}

    def update_comment(self, repo, comment_id, body):
        self._rec("update_comment", repo, comment_id, body)
        if comment_id in self.gone:
            raise httpx.HTTPStatusError("gone", request=httpx.Request("PATCH", "http://x"), response=httpx.Response(404))
        return {"id": comment_id}

    def create_issue(self, repo, title, body, labels):
        self._rec("create_issue", repo, title, body, labels)
        return {"number": 77, "html_url": "http://x/77"}

    def create_check_run(self, repo, sha, **fields):
        self._rec("create_check_run", repo, sha, **fields)
        self.next_id += 1
        return {"id": self.next_id}

    def update_check_run(self, repo, check_id, **fields):
        self._rec("update_check_run", repo, check_id, **fields)
        return {"id": check_id}

    def names(self):
        return [c[0] for c in self.calls]


@pytest.fixture
def gh(monkeypatch):
    fake = FakeGH()
    monkeypatch.setattr(actions, "client_for", lambda r: fake)
    return fake


@pytest.fixture
def item(repo):
    return db.fetch_one("INSERT INTO items (repo_id, kind, github_number, source) VALUES (%s, 'issue', 12, 'webhook') RETURNING *",
                        (repo["id"],))


def rows(kind=None):
    return db.fetch_all("SELECT * FROM actions WHERE kind = coalesce(%s, kind) ORDER BY id", (kind,))


def test_label_unlabel_assign_record_actions(gh, item, repo):
    actions.label(item, repo, ["bug", "p1"], None)
    actions.label(item, repo, [], None)  # nothing to do, nothing recorded
    actions.unlabel(item, repo, "needs-info", None)
    actions.assign(item, repo, ["alice"], None)
    assert gh.calls == [("add_labels", ("acme/widgets", 12, ["bug", "p1"]), {}),
                        ("remove_label", ("acme/widgets", 12, "needs-info"), {}),
                        ("add_assignees", ("acme/widgets", 12, ["alice"]), {})]
    r = rows()
    assert [x["kind"] for x in r] == ["label", "unlabel", "assign"]
    assert r[0]["github_ref"] == "acme/widgets#12" and r[0]["item_id"] == item["id"]
    assert r[0]["payload"] == {"labels": ["bug", "p1"], "dry_run": False}


def test_dry_run_records_without_calling_github(monkeypatch, gh, item, repo):
    monkeypatch.setattr(settings, "dry_run", True)
    actions.label(item, repo, ["bug"], None)
    actions.unlabel(item, repo, "x", None)
    actions.assign(item, repo, ["a"], None)
    actions.comment(item, repo, "hi", None, "triage:needs_info")
    actions.check_run(item, repo, "abc1234def", "t", "s", None)
    issue = actions.file_issue(repo, "T", "B", ["ci-report"], None)
    assert gh.calls == [] and issue["number"] is None
    r = rows()
    assert [x["kind"] for x in r] == ["label", "unlabel", "assign", "comment", "check_run", "file_issue"]
    assert all(x["payload"]["dry_run"] is True for x in r)
    assert db.fetch_one("SELECT count(*) AS n FROM comment_state")["n"] == 0


def test_comment_footer_and_dedupe(gh, item, repo):
    footer = f"\n\n---\n<sub>OSS Inbox · [why this comment?]({settings.dashboard_url}/items/{item['id']})</sub>"
    actions.comment(item, repo, "Please add a repro.\n", None, "triage:needs_info")
    assert gh.calls[0][1][2] == "Please add a repro." + footer
    assert "<!--" not in gh.calls[0][1][2]

    actions.comment(item, repo, "v2", None, "triage:needs_info")  # same key: edit, don't repost
    actions.comment(item, repo, "v3", None, "triage:other")  # same prefix: edits the earlier comment
    assert gh.names() == ["create_comment", "update_comment", "update_comment"]
    assert [c[1][1] for c in gh.calls[1:]] == [101, 101]
    assert db.fetch_one("SELECT count(*) AS n FROM comment_state WHERE github_comment_id = 101")["n"] == 2

    actions.comment(item, repo, "ci note", None, "ci:merged")  # different prefix: new comment
    assert gh.names()[-1] == "create_comment" and gh.calls[-1][1][1] == 12
    assert [x["payload"]["comment_id"] for x in rows("comment")] == [101, 101, 101, 102]


def test_comment_recreated_when_deleted_on_github(gh, item, repo):
    actions.comment(item, repo, "a", None, "k")
    gh.gone.add(101)
    actions.comment(item, repo, "b", None, "k")
    assert gh.names() == ["create_comment", "update_comment", "create_comment"]
    assert db.fetch_one("SELECT github_comment_id FROM comment_state WHERE key = 'k'")["github_comment_id"] == 102


def test_check_run_one_per_sha(gh, item, repo):
    actions.check_run(item, repo, "sha1111111", "Triage", "summary", None)
    actions.check_run(item, repo, "sha1111111", "Triage 2", "summary 2", None)
    actions.check_run(item, repo, "sha2222222", "Triage", "summary", None)
    assert gh.names() == ["create_check_run", "update_check_run", "create_check_run"]
    name, args, fields = gh.calls[0]
    assert args == ("acme/widgets", "sha1111111") and fields["name"] == "OSS Inbox" and fields["conclusion"] == "neutral"
    assert gh.calls[1][1] == ("acme/widgets", 101) and fields["output"]["title"] == "Triage"
    assert gh.calls[1][2]["output"] == {"title": "Triage 2", "summary": "summary 2"}
    assert [x["payload"]["check_run_id"] for x in rows("check_run")] == [101, 101, 102]


def test_file_issue_returns_issue_and_records_without_item(gh, repo):
    issue = actions.file_issue(repo, "Flaky test", "body", ["ci-report"], None)
    assert issue["number"] == 77 and gh.calls[0][1] == ("acme/widgets", "Flaky test", "body", ["ci-report"])
    r = rows("file_issue")[0]
    assert r["item_id"] is None and r["github_ref"] == "acme/widgets#77"
