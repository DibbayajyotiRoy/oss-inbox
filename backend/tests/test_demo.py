"""DEMO_MODE: sign in without GitHub, admin on demo repos only, every action dry-run, and a seeded org that fills every screen."""
import httpx
import pytest
from fastapi.testclient import TestClient

from app import actions, auth, db, demo, metrics, repo_config
from app.github import GitHubClient, client_for
from app.main import app
from app.questions import QUESTIONS
from app.settings import settings

DEMO_USER = auth.User(0, "demo", "", "demo")


@pytest.fixture
def demo_mode(monkeypatch):
    monkeypatch.setattr(settings, "demo_mode", True)
    monkeypatch.setattr(settings, "dry_run", False)  # demo mode alone must be enough
    boom = lambda *a, **k: pytest.fail("demo mode must not call GitHub")  # noqa: E731
    monkeypatch.setattr(httpx, "get", boom)
    monkeypatch.setattr(httpx, "post", boom)
    monkeypatch.setattr(httpx.Client, "request", boom)


def test_login_signs_in_the_demo_user_and_me_lists_only_the_demo_org(demo_mode):
    db.execute("INSERT INTO orgs (github_installation_id, login) VALUES (1, 'acme'), (2, 'demo-org')")
    c = TestClient(app)
    r = c.get("/api/auth/login", follow_redirects=False)
    assert (r.status_code, r.headers["location"]) == (302, settings.dashboard_url)
    s = db.fetch_one("SELECT * FROM sessions")
    assert (s["github_user_id"], s["login"]) == (0, "demo")
    me = c.get("/api/me").json()
    assert me["login"] == "demo" and [o["login"] for o in me["orgs"]] == ["demo-org"]


def test_role_is_admin_for_demo_repos_and_none_elsewhere(demo_mode, org):
    mine = db.fetch_one("INSERT INTO orgs (github_installation_id, login) VALUES (9, 'demo-org') RETURNING id")
    repo = lambda org_id, gid, name: db.fetch_one(  # noqa: E731
        "INSERT INTO repos (org_id, github_repo_id, full_name) VALUES (%s, %s, %s) RETURNING *", (org_id, gid, name))
    assert auth.role(DEMO_USER, repo(mine["id"], 1, "demo-org/api")) == "admin"
    assert auth.role(DEMO_USER, repo(org["id"], 2, "acme/widgets")) is None


def test_actions_are_dry_run_and_never_reach_github(demo_mode, repo, monkeypatch):
    monkeypatch.setattr(actions, "client_for", lambda r: pytest.fail("must not build a GitHub client"))
    item = db.fetch_one("INSERT INTO items (repo_id, kind, github_number, source) VALUES (%s, 'issue', 5, 'webhook') RETURNING *", (repo["id"],))
    actions.label(item, repo, ["bug"], None)
    actions.unlabel(item, repo, "needs-info", None)
    actions.assign(item, repo, ["alice"], None)
    actions.comment(item, repo, "hello", None, "k")
    assert actions.file_issue(repo, "t", "b", [], None) == {"number": None, "html_url": None}
    actions.check_run(item, repo, "abcdef1234", "t", "s", None)
    kinds = db.fetch_all("SELECT kind, (payload->>'dry_run')::boolean AS dry FROM actions ORDER BY id")
    assert [k["kind"] for k in kinds] == ["label", "unlabel", "assign", "comment", "file_issue", "check_run"] and all(k["dry"] for k in kinds)


def test_demo_github_client_returns_seed_like_reads(demo_mode, repo):
    gh = client_for(repo)
    assert not isinstance(gh, GitHubClient)
    assert gh.permission("acme/widgets", "demo") == "admin" and gh.get_file("acme/widgets", "x") is None
    assert "bug" in gh.list_labels("acme/widgets") and "oss-inbox: held" not in gh.list_labels("acme/widgets")  # stock labels only until set up
    assert gh.create_label("acme/widgets", "x") is None


def api_get(c, path, **params):
    r = c.get(path, params=params)
    assert r.status_code == 200, (path, r.text)
    return r.json()


def test_seeded_demo_org_fills_every_screen(demo_mode):
    db.execute("INSERT INTO orgs (github_installation_id, login) VALUES (1, 'acme')")
    demo.seed()
    stats = demo.seed()  # idempotent: wipes demo-org and starts over
    assert db.fetch_one("SELECT count(*) AS n FROM orgs")["n"] == 2 and db.fetch_one("SELECT count(*) AS n FROM repos")["n"] == 3
    issues = db.fetch_one("SELECT count(*) FILTER (WHERE kind = 'issue') AS i, count(*) FILTER (WHERE kind = 'pr') AS p FROM items")
    assert issues["i"] >= 330 and issues["p"] >= 110 and stats["decisions"] > 3000
    labeled = db.fetch_one("SELECT count(DISTINCT g.item_id) AS n FROM ground_truth g JOIN items i ON i.id = g.item_id WHERE i.kind IN ('issue', 'pr')")["n"]
    assert 0.5 < labeled / (issues["i"] + issues["p"]) < 0.75  # ground truth for roughly 60% of items
    assert db.fetch_one("SELECT count(*) AS n FROM actions WHERE NOT coalesce((payload->>'dry_run')::boolean, false)")["n"] == 0

    c = TestClient(app)
    c.get("/api/auth/login", follow_redirects=False)
    org = api_get(c, "/api/me")["orgs"][0]
    cards = {r["full_name"]: r for r in api_get(c, f"/api/orgs/{org['id']}/overview")["repos"]}
    assert set(cards) == {"demo-org/api", "demo-org/web", "demo-org/infra"}
    api, web, infra = (cards[f"demo-org/{n}"] for n in ("api", "web", "infra"))
    assert api["items_30d"] > 100 and web["items_30d"] > 60 and 0.7 < api["accuracy"] < 0.97 and 0 < api["override_rate"] < 0.15
    assert 12 <= api["queued_open"] + web["queued_open"] <= 30 and 4 <= api["held_open"] + web["held_open"] <= 8
    assert all(sum(d[o] for d in api["trend"]) > 0 for o in ("acted", "queued", "shadow"))
    assert not infra["enabled"] and infra["items_30d"] == 0 and infra["accuracy"] is None and {c["role"] for c in cards.values()} == {"admin"}

    for card in (api, web):
        rid = card["id"]
        d = api_get(c, f"/api/repos/{rid}")
        assert d["backfill_status"] == "done" and d["config_source"] == "repo" and "auto" in d["features"].values() and d["config_error"] is None
        assert sum(q["measured"] for q in d["questions"]) >= 8
        min_samples = repo_config.load(db.fetch_one("SELECT * FROM repos WHERE id = %s", (rid,))).evaluation.min_samples
        auto = [q for q in d["questions"] if d["features"][q["feature"]] == "auto"]
        assert len(auto) >= 4
        for q in auto:  # CONTRACT rule 2: `auto` is only ever shown for features whose every question is measured and above its threshold
            s = metrics.question_stats(rid, q["id"])
            assert s.n >= min_samples and s.accuracy >= q["threshold"] and q["measured"], (card["full_name"], q["id"], s)
        ob = api_get(c, f"/api/repos/{rid}/onboarding")
        assert ob["complete"] and all(s["done"] for s in ob["steps"])
        assert api_get(c, f"/api/repos/{rid}/labels/plan")["missing"] == []
        bf = api_get(c, f"/api/repos/{rid}/backfill")
        assert bf["status"] == "done" and bf["processed"] > 50 and bf["with_truth"] > 30 and bf["finished_at"]
        queue = api_get(c, f"/api/repos/{rid}/queue", limit=200)["items"]
        assert len(queue) == card["queued_open"] and all(e["suggestions"] for e in queue if e["feature"] != "pipeline")
        assert api_get(c, f"/api/repos/{rid}/queue", bucket="held")["items"]
        ev = api_get(c, f"/api/repos/{rid}/evaluation")
        assert len(ev["questions"]) >= 8 and any(q["worst_misses"] and q["confusion"] and q["recommended_threshold"] for q in ev["questions"])
        assert any(b["n"] for b in api_get(c, f"/api/repos/{rid}/calibration", question_id="issue.type")["bins"])
        assert len(api_get(c, f"/api/repos/{rid}/preview", question_id="issue.type")["points"]) > 20
        assert api_get(c, f"/api/repos/{rid}/flaky-tests")["items"] and api_get(c, f"/api/repos/{rid}/ci-tokens")["items"]
        cfg = api_get(c, f"/api/repos/{rid}/config")
        assert cfg["source"] == "repo" and "areas:" in cfg["yaml"] and cfg["labels"]
        audit, page = [], {"next_cursor": None}
        while True:  # the oldest entries (repo.enable, ci_token.create) sit on the last page
            page = api_get(c, f"/api/repos/{rid}/audit", limit=200, **({"cursor": page["next_cursor"]} if page["next_cursor"] else {}))
            audit += page["items"]
            if not page["next_cursor"]:
                break
        assert {"repo.enable", "queue.accept", "ci_token.create"} <= {a["action"] for a in audit}

    qs = {q["id"]: q for q in api_get(c, f"/api/repos/{api['id']}")["questions"]}  # the "not yet" state: shadow, measured, a few points short
    follows = qs["pr.follows_rules"]
    assert not follows["measured"] and follows["n"] >= 20 and 0.02 < follows["threshold"] - follows["accuracy"] < 0.12

    reports = api_get(c, f"/api/repos/{api['id']}/ci-reports", limit=200)["items"]
    assert {r["outcome"] for r in reports} >= {"filed", "merged", "flaky", "infra", "queued", "rate_limited", "held"}
    ci = {r["outcome"] for r in reports if r["source"] == "ci" and r["candidates"]}
    assert ci >= {"filed", "merged", "flaky", "infra", "queued", "rate_limited"}  # candidates exist for every CI outcome
    assert all(r["candidates"] for r in reports if r["outcome"] == "merged") and all(r["issue_number"] for r in reports if r["outcome"] == "filed")

    infra_ob = api_get(c, f"/api/repos/{infra['id']}/onboarding")
    assert not infra_ob["complete"] and not infra_ob["steps"][0]["done"] and api_get(c, f"/api/repos/{infra['id']}/labels/plan")["missing"]

    acted = db.fetch_one("SELECT item_id FROM actions WHERE item_id IS NOT NULL ORDER BY id LIMIT 1")["item_id"]
    item = api_get(c, f"/api/items/{acted}")
    assert item["runs"][0]["decisions"] and item["runs"][0]["state_text"].startswith("## Title") and item["actions"][0]["dry_run"]

    runs_before = db.fetch_one("SELECT count(*) AS n FROM decision_runs")["n"]
    held = api_get(c, f"/api/repos/{api['id']}/queue", bucket="held")["items"][0]
    assert c.post(f"/api/queue/{held['id']}/resolve", json={"action": "release"}).json() == {"ok": True}
    assert db.fetch_one("SELECT count(*) AS n FROM decision_runs")["n"] == runs_before  # nothing to re-run triage against in the demo
    assert c.post(f"/api/repos/{api['id']}/backfill").json() == {"queued": True}
    assert api_get(c, f"/api/repos/{api['id']}/backfill")["status"] == "done"  # the seeded results stay
    assert "edit_url" in c.post(f"/api/repos/{api['id']}/features", json={"feature": "priority", "mode": "auto"}).json()
    assert c.post(f"/api/repos/{api['id']}/labels/sync").json() == {"created": []}
