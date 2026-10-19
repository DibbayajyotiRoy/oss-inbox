"""v0.2 additions: setup status, onboarding, labels plan, backfill progress, config render, feature changes, config_error."""
from types import SimpleNamespace

import httpx
import pytest
import yaml
from fastapi import FastAPI
from fastapi.testclient import TestClient
from psycopg.types.json import Jsonb

import app.github as github_pkg
from app import auth, db, install, repo_config
from app.api import dashboard, setup
from app.redis_client import redis
from app.settings import settings

USER = auth.User(7, "maint", "", "t")
WANTED = repo_config.wanted_labels(repo_config.RepoConfig())


@pytest.fixture
def box(monkeypatch):
    state = {"role": "admin"}
    monkeypatch.setattr(auth, "role", lambda u, r: state["role"])
    return state


@pytest.fixture
def client(box):
    api = FastAPI()
    api.include_router(dashboard.router)
    api.dependency_overrides[auth.current_user] = lambda: USER
    return TestClient(api)


@pytest.fixture
def gh(monkeypatch):
    """GitHub stand-in: `labels` is what list_labels returns, `fail` an exception to raise, `files` for get_file."""
    fake = SimpleNamespace(labels=[], fail=None, calls=0, files={})

    class GH:
        def list_labels(self, repo):
            fake.calls += 1
            if fake.fail:
                raise fake.fail
            return list(fake.labels)

        def get_file(self, repo, path, ref=None):
            return fake.files.get((repo, path))

    monkeypatch.setattr(github_pkg, "client_for", lambda r: GH())
    monkeypatch.setattr(repo_config, "client_for", lambda r: GH())
    monkeypatch.setattr(install, "client_for", lambda r: GH())  # labels/sync
    return fake


def steps(client, repo_id):
    r = client.get(f"/api/repos/{repo_id}/onboarding").json()
    return r["complete"], {s["id"]: s for s in r["steps"]}


# ---- /api/setup/status ----------------------------------------------------------------------------------------------

def setup_client():
    api = FastAPI()
    api.include_router(setup.router)
    return TestClient(api)


def test_setup_status_before_the_app_exists(monkeypatch):
    for k, v in dict(github_app_id="", github_app_slug="", typesafe_api_key="", decision_backend="jev", demo_mode=False).items():
        monkeypatch.setattr(settings, k, v)
    s = setup_client().get("/api/setup/status").json()
    assert s == {"app_configured": False, "app_slug": None, "install_url": None, "setup_url": "/api/setup?auto=1", "decision_backend": "jev",
                 "decision_key_present": False, "calibrated": True, "model": settings.jev_model, "public_url": settings.public_url,
                 "dashboard_url": settings.dashboard_url, "demo_mode": False, "installations": 0}


def test_setup_status_configured_counts_orgs_and_reads_the_right_key(monkeypatch, org):
    for k, v in dict(github_app_id="42", github_app_slug="oss-inbox-x", typesafe_api_key="k", anthropic_api_key="").items():
        monkeypatch.setattr(settings, k, v)
    s = setup_client().get("/api/setup/status").json()
    assert (s["app_configured"], s["app_slug"], s["setup_url"], s["installations"]) == (True, "oss-inbox-x", None, 1)
    assert s["install_url"] == "https://github.com/apps/oss-inbox-x/installations/new" and s["decision_key_present"] is True
    monkeypatch.setattr(settings, "decision_backend", "anthropic")  # the Jev key no longer counts
    s = setup_client().get("/api/setup/status").json()
    assert (s["decision_key_present"], s["calibrated"], s["model"]) == (False, False, settings.anthropic_model)


# ---- onboarding -----------------------------------------------------------------------------------------------------

def test_onboarding_walks_through_every_step(client, repo, gh):
    done, s = steps(client, repo["id"])
    assert not done and [k for k, v in s.items() if v["done"]] == ["enabled"]
    assert s["labels"]["detail"].startswith("18 missing: bug, enhancement") and s["config"]["optional"] and s["mode"]["optional"]
    assert "Replays" in s["backfill"]["detail"] and "Waiting" in s["first_event"]["detail"]

    gh.labels = ["BUG", *WANTED[1:]]  # label names compare case-insensitively
    db.execute("UPDATE repos SET backfill_status = 'done'")
    redis.flushdb()  # the label list is cached for 60s
    done, s = steps(client, repo["id"])
    assert not done and s["labels"]["done"] and s["backfill"]["done"] and not s["first_event"]["done"]

    item = db.fetch_one("INSERT INTO items (repo_id, kind, github_number, title, source) VALUES (%s, 'issue', 1, 't', 'backfill') RETURNING id", (repo["id"],))
    run = lambda trigger: db.execute("INSERT INTO decision_runs (item_id, trigger, backend, state_hash) VALUES (%s, %s, 'jev', 'h')", (item["id"], trigger))  # noqa: E731
    run("backfill")
    assert not steps(client, repo["id"])[0]  # a backfill run is not a live event
    run("opened")
    done, s = steps(client, repo["id"])
    assert done and not s["mode"]["done"] and not s["config"]["done"]  # optional steps don't block completion

    db.execute("UPDATE repos SET config = %s, config_source = 'repo'", (Jsonb(repo_config.parse_config('features: {spam: {mode: "auto"}}').model_dump()),))
    _, s = steps(client, repo["id"])
    assert s["mode"]["done"] and s["config"]["done"] and s["mode"]["detail"] is None


def test_onboarding_reports_backfill_state_and_disabled_private_repo(client, repo, gh):
    db.execute("UPDATE repos SET enabled = false, private = true")
    done, s = steps(client, repo["id"])
    assert not done and "private repo" in s["enabled"]["detail"]
    for status, text in (("running", "Running"), ("error:repo is not enabled", "repo is not enabled")):
        db.execute("UPDATE repos SET backfill_status = %s", (status,))
        assert text in steps(client, repo["id"])[1]["backfill"]["detail"]


def test_onboarding_labels_step_survives_github_failure_and_caches(client, repo, gh):
    gh.fail = httpx.ConnectError("down")
    _, s = steps(client, repo["id"])
    assert s["labels"]["done"] is False and "Could not read" in s["labels"]["detail"] and "down" in s["labels"]["detail"]
    gh.fail, gh.labels, gh.calls = None, list(WANTED), 0
    assert steps(client, repo["id"])[1]["labels"]["done"]
    steps(client, repo["id"])
    assert gh.calls == 1  # cached for 60s
    client.post(f"/api/repos/{repo['id']}/labels/sync")  # one call to create missing labels; it also drops the cache
    steps(client, repo["id"])
    assert gh.calls == 3  # so the step re-reads GitHub at once


def test_onboarding_config_error_is_explained(client, repo, gh):
    gh.files[("acme/widgets", ".github/oss-inbox.yml")] = ("features: [", "s")
    _, s = steps(client, repo["id"])
    assert not s["config"]["done"] and "could not be parsed" in s["config"]["detail"] and "invalid YAML" in s["config"]["detail"]


# ---- labels plan ----------------------------------------------------------------------------------------------------

def test_labels_plan(client, repo, gh):
    gh.labels = ["bug", "Priority: P0", "wontfix"]
    db.execute("UPDATE repos SET config = %s, config_source = 'repo'", (Jsonb(repo_config.parse_config(
        "areas: {core: {owner: alice, paths: ['src/**']}}\nlabels: {route.area: {core: 'area/core'}}").model_dump()),))
    r = client.get(f"/api/repos/{repo['id']}/labels/plan").json()
    assert r["existing"] == ["bug", "Priority: P0", "wontfix"]
    assert "bug" not in r["missing"] and "priority: p0" not in [m.lower() for m in r["missing"]] and "area/core" in r["missing"] and "spam" in r["missing"]
    assert r["mapping"]["issue.type"]["feature"] == "enhancement" and r["mapping"]["route.area"] == {"core": "area/core"}
    assert r["mapping"]["held"] == "oss-inbox: held"
    gh.fail = httpx.ConnectError("down")
    redis.flushdb()
    assert client.get(f"/api/repos/{repo['id']}/labels/plan").status_code == 502


# ---- backfill progress ----------------------------------------------------------------------------------------------

def test_backfill_progress_endpoint(client, repo):
    url = f"/api/repos/{repo['id']}/backfill"
    assert client.get(url).json() == {"status": "idle", "processed": 0, "total": None, "with_truth": 0, "errors": 0, "error": None,
                                      "started_at": None, "finished_at": None}
    p = {"processed": 12, "total": 40, "with_truth": 9, "errors": 1, "started_at": "2026-01-01T00:00:00+00:00", "finished_at": None}
    db.execute("UPDATE repos SET backfill_status = 'running', backfill_progress = %s", (Jsonb(p),))
    assert client.get(url).json() == {"status": "running", "error": None, **p}
    db.execute("UPDATE repos SET backfill_status = 'error:repo is not enabled'")
    r = client.get(url).json()
    assert (r["status"], r["error"], r["processed"]) == ("error", "repo is not enabled", 12)


def test_queueing_a_backfill_resets_progress(client, repo, monkeypatch):
    from app import jobs
    monkeypatch.setattr(jobs, "enqueue", lambda *a, **k: None)
    db.execute("UPDATE repos SET backfill_status = 'done', backfill_progress = %s", (Jsonb({"processed": 5}),))
    assert client.post(f"/api/repos/{repo['id']}/backfill").json() == {"queued": True}
    row = db.fetch_one("SELECT backfill_status, backfill_progress FROM repos")
    assert (row["backfill_status"], row["backfill_progress"]) == ("queued", None)


# ---- config render --------------------------------------------------------------------------------------------------

def render(client, repo, **body):
    return client.post(f"/api/repos/{repo['id']}/config/render", json=body)


def test_render_accepts_yaml_text_verbatim(client, repo):
    text = "# our config\ncomments: true\nfeatures:\n  spam: {mode: off}\n  routing: {mode: auto}\n"
    r = render(client, repo, yaml=text).json()
    assert r["yaml"] == text and r["errors"] == []  # comments survive, `off` is read as "off"
    assert r["parsed"]["comments"] is True and r["parsed"]["features"]["spam"]["mode"] == "off" and r["parsed"]["features"]["routing"]["mode"] == "auto"
    assert r["parsed"]["labels"]["held"] == "oss-inbox: held"  # defaults filled in
    assert r["edit_url"].startswith("https://github.com/acme/widgets/new/main?filename=.github/oss-inbox.yml&value=")
    db.execute("UPDATE repos SET config_source = 'repo'")
    assert render(client, repo, yaml=text).json()["edit_url"] == "https://github.com/acme/widgets/edit/main/.github/oss-inbox.yml"


def test_render_yaml_errors_are_readable(client, repo):
    r = render(client, repo, yaml="features: {issue_triage: {mode: on}}").json()
    assert r["parsed"] == {} and len(r["errors"]) == 1
    assert 'features.issue_triage.mode' in r["errors"][0] and '"auto"' in r["errors"][0]
    r = render(client, repo, yaml="features: [").json()
    assert "invalid YAML" in r["errors"][0]
    r = render(client, repo, yaml="comment: true\nthresholds: {priority: high}").json()
    assert len(r["errors"]) == 2


def test_render_parsed_and_validation(client, repo):
    r = render(client, repo, parsed={"comments": True, "features": {"spam": {"mode": "auto"}}}).json()
    assert yaml.safe_load(r["yaml"]) == {"comments": True, "features": {"spam": {"mode": "auto"}}} and r["errors"] == []
    assert 'mode: "auto"' in r["yaml"] and r["parsed"]["comments"] is True
    bad = render(client, repo, parsed={"features": {"spam": {"mode": "sometimes"}}}).json()
    assert bad["errors"] and bad["parsed"] == {"features": {"spam": {"mode": "sometimes"}}}
    assert render(client, repo).status_code == 422
    assert render(client, repo, yaml="a: 1", parsed={}).status_code == 422


# ---- feature changes ------------------------------------------------------------------------------------------------

def test_set_feature_renders_yaml_and_writes_nothing(client, repo, gh, box):
    r = client.post(f"/api/repos/{repo['id']}/features", json={"feature": "priority", "mode": "auto"})
    body = r.json()
    parsed = yaml.safe_load(body["yaml"])
    assert parsed["features"]["priority"] == {"mode": "auto"} and parsed["features"]["spam"] == {"mode": "off"}  # `off` stays a string
    assert 'mode: "off"' in body["yaml"] and "filename=.github/oss-inbox.yml" in body["edit_url"]
    assert repo_config.parse_config(body["yaml"]).mode("priority") == "auto"
    assert db.fetch_one("SELECT config->'features'->'priority'->>'mode' AS m FROM repos")["m"] == "shadow"  # not applied, only rendered

    assert client.post(f"/api/repos/{repo['id']}/features", json={"feature": "nope", "mode": "auto"}).status_code == 400
    assert client.post(f"/api/repos/{repo['id']}/features", json={"feature": "spam", "mode": "on"}).status_code == 422
    box["role"] = "viewer"
    assert client.post(f"/api/repos/{repo['id']}/features", json={"feature": "spam", "mode": "auto"}).status_code == 403


# ---- config_error ---------------------------------------------------------------------------------------------------

def test_repo_detail_exposes_config_error_until_the_file_is_fixed(client, repo, gh):
    path = ("acme/widgets", ".github/oss-inbox.yml")
    gh.files[path] = ("features: {spam: {mode: on}}", "s1")
    detail = lambda: client.get(f"/api/repos/{repo['id']}").json()  # noqa: E731
    d = detail()
    assert 'features.spam.mode' in d["config_error"] and d["config_source"] == "default" and d["features"]["spam"] == "off"
    gh.files[path] = ("features: {spam: {mode: auto}}", "s2")
    repo_config.load(repo, refresh=True)
    d = detail()
    assert d["config_error"] is None and d["features"]["spam"] == "auto" and d["config_source"] == "repo"


# ---- comment-preserving config + chained feature edits ----------------------------------------------------------------

COMMENTED = """# OSS Inbox config for widgets
comments: true  # be chatty

features:
  # triage is the one we trust
  issue_triage: {mode: auto}   # keep
  spam:
    mode: off    # trial
    # reviewed monthly
  routing:
    mode: 'shadow'

areas: {}
"""


def features(client, repo, **body):
    return client.post(f"/api/repos/{repo['id']}/features", json=body).json()


def test_get_config_returns_the_repo_file_verbatim(client, repo, gh):
    gh.files[("acme/widgets", ".github/oss-inbox.yml")] = (COMMENTED, "s1")
    repo_config.load(repo, refresh=True)
    r = client.get(f"/api/repos/{repo['id']}/config").json()
    assert r["source"] == "repo" and r["yaml"] == COMMENTED and r["parsed"]["comments"] is True
    db.execute("UPDATE repos SET config_source = 'org'")  # org/default sources get the normalized render
    assert client.get(f"/api/repos/{repo['id']}/config").json()["yaml"] == repo_config.render_yaml(r["parsed"])


def test_feature_edit_keeps_comments_and_formatting(client, repo, gh):
    gh.files[("acme/widgets", ".github/oss-inbox.yml")] = (COMMENTED, "s1")
    repo_config.load(repo, refresh=True)
    r = features(client, repo, feature="spam", mode="auto")
    assert r["yaml"] == COMMENTED.replace("mode: off    # trial", 'mode: "auto"    # trial') and r["errors"] == []
    r = features(client, repo, feature="issue_triage", mode="off", yaml=r["yaml"])  # chained on the working text
    assert '  issue_triage: {mode: "off"}   # keep\n' in r["yaml"] and 'mode: "auto"    # trial' in r["yaml"]
    assert features(client, repo, feature="routing", mode="auto", yaml=r["yaml"])["yaml"].count("# reviewed monthly\n  routing:\n    mode: \"auto\"\n") == 1
    cfg = repo_config.parse_config(r["yaml"])
    assert (cfg.mode("issue_triage"), cfg.mode("spam"), cfg.comments) == ("off", "auto", True)


def test_feature_insert_and_append(client, repo, gh):
    r = features(client, repo, feature="pr_checks", mode="off", yaml="# hi\nfeatures:\n  spam:\n    mode: \"auto\"\n\ncomments: true\n")
    assert r["yaml"] == "# hi\nfeatures:\n  spam:\n    mode: \"auto\"\n  pr_checks:\n    mode: \"off\"\n\ncomments: true\n" and r["errors"] == []
    r = features(client, repo, feature="spam", mode="shadow", yaml="# only a comment\ncomments: true")
    assert r["yaml"] == '# only a comment\ncomments: true\nfeatures:\n  spam:\n    mode: "shadow"\n' and r["errors"] == []
    assert features(client, repo, feature="spam", mode="auto", yaml="")["yaml"] == 'features:\n  spam:\n    mode: "auto"\n'
    r = features(client, repo, feature="priority", mode="auto", yaml="features:\n    spam:\n        mode: off\n")  # 4-space indent
    assert repo_config.parse_config(r["yaml"]).mode("priority") == "auto" and r["errors"] == []
    r = features(client, repo, feature="spam", mode="auto", yaml="features: {spam: {mode: off}, routing: {mode: auto}}\n")  # flow style
    assert repo_config.parse_config(r["yaml"]).mode("spam") == "auto" and repo_config.parse_config(r["yaml"]).mode("routing") == "auto"


def test_feature_edit_defaults_to_the_normalized_render_and_reports_errors(client, repo, gh):
    r = features(client, repo, feature="priority", mode="auto")  # no file in the repo
    assert 'mode: "auto"' in r["yaml"] and repo_config.parse_config(r["yaml"]).mode("priority") == "auto" and r["errors"] == []
    r = features(client, repo, feature="spam", mode="auto", yaml="comment: true\nfeatures:\n  spam:\n    mode: off\n")
    assert r["yaml"].endswith('mode: "auto"\n') and len(r["errors"]) == 1 and "comment" in r["errors"][0]  # result is invalid: errors, yaml kept
    r = features(client, repo, feature="spam", mode="auto", yaml="features: [")
    assert "invalid YAML" in r["errors"][0] and r["edit_url"]
