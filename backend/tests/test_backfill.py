import hashlib
import sys
from types import SimpleNamespace

import pytest

import app
from app import backfill, cli, db

LABELS = {("issue.type", "bug"): "bug", ("issue.type", "feature"): "enhancement", ("priority", "p0"): "P0",
          ("route.area", "docs"): "area: docs", ("spam", None): "spam", ("breaking", None): "breaking"}


def ev(label, t, login="maint", type="User"):
    return {"event": "labeled", "actor": {"login": login, "type": type}, "label": {"name": label}, "created_at": f"2024-01-01T00:00:{t}Z"}


ISSUES = [
    {"number": 1, "title": "one", "body": "edited body", "state": "closed"},
    {"number": 2, "title": "really a PR", "body": "", "pull_request": {}},
    {"number": 3, "title": "three", "body": "plain body"},
    {"number": 4, "title": "boom", "body": ""},
    {"number": 5, "title": "llm down", "body": ""},
]
PULLS = [
    {"number": 10, "title": "ten", "body": "pr ten", "merged_at": "2024-01-02T00:00:00Z"},
    {"number": 11, "title": "eleven", "body": "pr eleven", "merged_at": "2024-01-02T00:00:00Z"},
    {"number": 12, "title": "closed unmerged", "body": "", "merged_at": None},
]
TIMELINES = {
    1: [ev("bug", "01", "jev[bot]", "Bot"), ev("enhancement", "02"), {"event": "commented"}, ev("bug", "04"), ev("P0", "03"),
        ev("area: docs", "05"), ev("spam", "06")],
    10: [ev("breaking", "01"), ev("bug", "02")],
}


@pytest.fixture
def fake(monkeypatch):
    calls = []

    class GH:
        def paginate(self, path, params=None, max_items=None):
            yield from ISSUES if path.endswith("/issues") else PULLS

        def original_body(self, repo, n):
            return "original body" if n == 1 else None

        def timeline(self, repo, n):
            return TIMELINES.get(n, [])

        def list_labels(self, repo):
            return ["bug", "Breaking"]

    class Cfg:
        areas = {"docs": {}}

        def label(self, key, answer=None):
            return LABELS.get((key, answer))

    def process(repo, kind, payload, trigger, actions_enabled=True):
        calls.append((kind, payload, trigger, actions_enabled))
        n = payload["number"]
        if n == 4:
            raise RuntimeError("boom")
        item = db.fetch_one(
            "INSERT INTO items (repo_id, kind, github_number, title, source) VALUES (%s, %s, %s, %s, 'backfill') "
            "ON CONFLICT (repo_id, kind, github_number) WHERE github_number IS NOT NULL DO UPDATE SET title = EXCLUDED.title "
            "RETURNING id", (repo["id"], kind, n, payload["title"]))
        return db.fetch_one("INSERT INTO decision_runs (item_id, trigger, backend, state_hash, error) VALUES (%s, %s, 'jev', 'h', %s) "
                            "RETURNING id", (item["id"], trigger, "llm down" if n == 5 else None))["id"]

    mods = {"github": SimpleNamespace(client_for=lambda repo: GH()), "pipeline": SimpleNamespace(process=process),
            "repo_config": SimpleNamespace(load=lambda repo: Cfg())}
    for name, mod in mods.items():  # stand-ins whether or not the real modules exist yet
        monkeypatch.setitem(sys.modules, f"app.{name}", mod)
        monkeypatch.setattr(app, name, mod, raising=False)
    return calls


def truth(repo):
    return {(r["github_number"], r["question_id"]): (r["answer"], r["source"]) for r in db.fetch_all(
        "SELECT i.github_number, g.question_id, g.answer, g.source FROM ground_truth g JOIN items i ON i.id = g.item_id "
        "WHERE i.repo_id = %s", (repo["id"],))}


def test_backfill_truth_and_pipeline_call(repo, fake):
    item = db.fetch_one("INSERT INTO items (repo_id, kind, github_number, source) VALUES (%s, 'issue', 1, 'webhook') RETURNING id",
                        (repo["id"],))
    db.execute("INSERT INTO ground_truth (item_id, question_id, answer, source) VALUES (%s, 'issue.type', 'bug', 'override')",
               (item["id"],))

    assert backfill.run(repo["id"]) == {"processed": 4, "with_truth": 3, "errors": 2}
    assert db.fetch_one("SELECT backfill_status FROM repos WHERE id = %s", (repo["id"],))["backfill_status"] == "done"

    by_number = {c[1]["number"]: c for c in fake}
    assert sorted(by_number) == [1, 3, 4, 5, 10, 11]  # PR-in-issues and unmerged PR skipped
    assert all(c[2:] == ("backfill", False) for c in fake)
    assert (by_number[1][0], by_number[1][1]["body"], by_number[1][1]["title"]) == ("issue", "original body", "one")
    assert by_number[3][1]["body"] == "plain body"  # never edited -> current body
    assert by_number[10][0] == "pr"

    assert truth(repo) == {
        (1, "issue.type"): ("bug", "override"),  # never overwritten
        (1, "priority"): ("p0", "backfill"), (1, "route.area"): ("docs", "backfill"), (1, "spam"): ("true", "backfill"),
        (10, "pr.breaking"): ("true", "backfill"), (11, "pr.breaking"): ("false", "backfill"),
    }  # bot's "bug" label ignored, a later "bug" doesn't beat the earlier "enhancement"; "bug" on a PR isn't issue.type

    fake.clear()  # second run only retries what failed
    assert backfill.run(repo["id"]) == {"processed": 0, "with_truth": 0, "errors": 2}
    assert sorted(c[1]["number"] for c in fake) == [4, 5]


def test_backfill_earliest_label_and_limit(repo, fake):
    backfill.run(repo["id"], limit=1)
    assert sorted(c[1]["number"] for c in fake) == [1, 10]
    assert truth(repo)[(1, "issue.type")] == ("feature", "backfill")


def test_backfill_refuses_disabled_repo_and_reports_failure(repo, fake, monkeypatch):
    db.execute("UPDATE repos SET enabled = false WHERE id = %s", (repo["id"],))
    assert backfill.run(repo["id"])["errors"] == 1 and not fake
    assert db.fetch_one("SELECT backfill_status FROM repos")["backfill_status"] == "error:repo is not enabled"
    db.execute("UPDATE repos SET enabled = true")
    monkeypatch.setattr(sys.modules["app.github"], "client_for", lambda r: (_ for _ in ()).throw(RuntimeError("no install")))
    backfill.run(repo["id"])
    assert db.fetch_one("SELECT backfill_status FROM repos")["backfill_status"] == "error:no install"


def test_cli_eval_and_token(repo, fake, capsys):
    item = db.fetch_one("INSERT INTO items (repo_id, kind, github_number, source) VALUES (%s, 'issue', 99, 'webhook') RETURNING id",
                        (repo["id"],))["id"]
    run = db.fetch_one("INSERT INTO decision_runs (item_id, trigger, backend, state_hash) VALUES (%s, 'webhook', 'jev', 'h') "
                       "RETURNING id", (item,))["id"]
    db.execute("INSERT INTO decisions (run_id, item_id, repo_id, question_id, base_question, answer, probabilities, confidence, "
               "threshold_at_time) VALUES (%s, %s, %s, 'issue.type', 'issue.type', 'bug', '{}', 0.9, 0.85)", (run, item, repo["id"]))
    db.execute("INSERT INTO ground_truth (item_id, question_id, answer, source) VALUES (%s, 'issue.type', 'bug', 'backfill')", (item,))
    assert cli.main(["eval", "acme/widgets", "--limit", "1"]) == 0
    out = capsys.readouterr().out
    assert "Upper bound" in out and "issue.type" in out and "100.0%" in out
    assert sorted(c[1]["number"] for c in fake) == [1, 10]  # backfill ran before the table
    with pytest.raises(SystemExit):
        cli.main(["eval", "acme/missing"])
    assert cli.main(["token", "acme/widgets", "ci"]) == 0
    token = capsys.readouterr().out.split()[-1]
    row = db.fetch_one("SELECT * FROM ci_tokens")
    assert (row["name"], row["created_by"], row["token_hash"]) == ("ci", "cli", hashlib.sha256(token.encode()).hexdigest())


def test_backfill_progress_is_stored_after_every_item(repo, fake, monkeypatch):
    seen, real = [], backfill._progress

    def spy(repo_id, counts, total, started, finished=None):
        seen.append((dict(counts), finished))
        real(repo_id, counts, total, started, finished)

    monkeypatch.setattr(backfill, "_progress", spy)
    backfill.run(repo["id"])
    assert len(seen) == 9  # start, labels read, 6 items (issues 1/3/4/5, PRs 10/11), finish
    assert [c["processed"] for c, _ in seen] == sorted(c["processed"] for c, _ in seen)
    assert seen[-1][1] is not None and all(f is None for _, f in seen[:-1])
    p = db.fetch_one("SELECT backfill_progress FROM repos")["backfill_progress"]
    assert (p["processed"], p["with_truth"], p["errors"], p["total"]) == (4, 3, 2, None)  # fake GitHub has no search: total unknown
    assert p["started_at"] < p["finished_at"] or p["started_at"] == p["finished_at"]


def test_backfill_total_counts_what_a_run_can_visit():
    class GH:
        def request(self, method, path, **kw):
            return {"total_count": 7 if "is:issue" in kw["params"]["q"] else 2}

    assert backfill._total(GH(), "a/b", 5) == 5 + 2  # capped by the limit per kind
    assert backfill._total(GH(), "a/b", 100) == 7 + 2
    assert backfill._total(SimpleNamespace(), "a/b", 5) is None  # GitHub search unavailable
