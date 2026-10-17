import httpx
import pytest
import yaml

from app import db, repo_config
from app.repo_config import RepoConfig, edit_url, load, parse_config, render_yaml


def test_defaults():
    c = parse_config(None)
    assert c.mode("issue_triage") == "shadow" and c.mode("spam") == "off" and c.comments is False
    assert c.label("issue.type", "feature") == "enhancement"
    assert c.label("issue.type", "nope") is None
    assert c.label("priority", "p0") == "priority: p0"
    assert c.label("needs_info") == "needs-info" and c.label("held") == "jev: held" and c.label("ci") == "ci-report"
    assert c.label("route.area", "core") == "area: core"
    assert c.core_team == ["OWNER", "MEMBER", "COLLABORATOR"]
    assert RepoConfig().model_dump() == c.model_dump()


def test_merge_default_org_repo():
    org = """
comments: true
features: {issue_triage: {mode: auto}, pr_checks: {mode: off}}
labels: {issue.type: {bug: "type: bug"}, needs_info: "triage/needs-info"}
thresholds: {issue.type: 0.9}
"""
    repo = """
features: {pr_checks: {mode: auto}}
labels:
  issue.type: {feature: "kind/feature"}
  route.area: {core: "area/core"}
thresholds: {priority: 0.8}
areas: {core: {owner: alice, paths: ["src/**"]}}
"""
    c = parse_config(repo, org)
    assert c.comments is True  # from org
    assert c.mode("issue_triage") == "auto" and c.mode("pr_checks") == "auto" and c.mode("routing") == "shadow"
    assert c.label("issue.type", "bug") == "type: bug"  # org
    assert c.label("issue.type", "feature") == "kind/feature"  # repo
    assert c.label("issue.type", "docs") == "documentation"  # default survives the merge
    assert c.label("needs_info") == "triage/needs-info"
    assert c.label("route.area", "core") == "area/core" and c.label("route.area", "ui") == "area: ui"
    assert c.thresholds == {"issue.type": 0.9, "priority": 0.8}
    assert c.areas["core"].owner == "alice" and c.areas["core"].paths == ["src/**"]


@pytest.mark.parametrize("text,needle", [
    ("features: [", "invalid YAML"),
    ("- just\n- a list", "mapping"),
    ("features: {issue_triage: {mode: sometimes}}", "features.issue_triage.mode"),
    ("features: {issue_triag: {mode: auto}}", "unknown feature"),
    ("comment: true", "comment"),
    ("thresholds: {priority: high}", "thresholds.priority"),
])
def test_invalid_config_raises_readable_error(text, needle):
    with pytest.raises(ValueError) as e:
        parse_config(text)
    assert needle in str(e.value)


def test_invalid_org_yaml_is_named():
    with pytest.raises(ValueError, match="org config"):
        parse_config(None, "a: [")


def test_edit_url_and_render_yaml():
    assert edit_url("a/b", "main", "x", True) == "https://github.com/a/b/edit/main/.github/jev-triage.yml"
    url = edit_url("a/b", "dev", "comments: true\nmodel: x y\n", False)
    assert url == ("https://github.com/a/b/new/dev?filename=.github/jev-triage.yml"
                   "&value=comments%3A%20true%0Amodel%3A%20x%20y%0A")
    data = {"comments": True, "features": {"spam": {"mode": "auto"}}}
    assert yaml.safe_load(render_yaml(data)) == data and render_yaml(data).startswith("comments: true")


class FakeGH:
    def __init__(self, files):
        self.files, self.calls = files, []

    def get_file(self, repo, path, ref=None):
        self.calls.append((repo, path))
        if isinstance(self.files, Exception):
            raise self.files
        return self.files.get((repo, path))


def test_load_refresh_caches_and_reads_rules(monkeypatch, repo):
    fake = FakeGH({
        ("acme/widgets", ".github/jev-triage.yml"): ("comments: true\n", "sha-repo"),
        ("acme/.github", ".github/jev-triage.yml"): ("features: {routing: {mode: auto}}\n", "sha-org"),
        ("acme/widgets", "CONTRIBUTING.md"): ("Be nice.", "sha-rules"),
    })
    monkeypatch.setattr(repo_config, "client_for", lambda r: fake)
    c = load(repo)
    assert c.comments and c.mode("routing") == "auto"
    row = db.fetch_one("SELECT * FROM repos WHERE id = %s", (repo["id"],))
    assert (row["config_source"], row["config_sha"], row["rules_text"], row["rules_sha"]) == ("repo", "sha-repo", "Be nice.", "sha-rules")
    assert row["config"]["comments"] is True and row["config_text"] == "comments: true\n"  # raw text kept for the dashboard
    assert ("acme/widgets", "AGENTS.md") in fake.calls  # rules candidates tried in order

    fake.calls.clear()
    assert load(row).comments and load(repo).comments  # cache: from the row, and from the DB for a stale row dict
    assert fake.calls == []

    fake.files[("acme/widgets", ".github/jev-triage.yml")] = ("comments: false\n", "sha2")
    assert load(row, refresh=True).comments is False and fake.calls


def test_load_org_only_and_explicit_rules_file(monkeypatch, repo):
    fake = FakeGH({
        ("acme/.github", ".github/jev-triage.yml"): ("rules_file: docs/RULES.md\n", "sha-org"),
        ("acme/widgets", "docs/RULES.md"): ("rules!", "r1"),
        ("acme/widgets", "CONTRIBUTING.md"): ("ignored", "r2"),
    })
    monkeypatch.setattr(repo_config, "client_for", lambda r: fake)
    load(repo)
    row = db.fetch_one("SELECT * FROM repos WHERE id = %s", (repo["id"],))
    assert (row["config_source"], row["config_sha"], row["rules_text"], row["config_text"]) == ("org", "sha-org", "rules!", None)


def test_load_invalid_yaml_falls_back_to_defaults(monkeypatch, repo):
    fake = FakeGH({("acme/widgets", ".github/jev-triage.yml"): ("features: [", "s")})
    monkeypatch.setattr(repo_config, "client_for", lambda r: fake)
    c = load(repo)
    assert c.model_dump() == RepoConfig().model_dump()
    assert db.fetch_one("SELECT config_source FROM repos")["config_source"] == "default"


def test_load_github_unreachable_uses_defaults_then_cache(monkeypatch, repo):
    monkeypatch.setattr(repo_config, "client_for", lambda r: FakeGH(httpx.ConnectError("down")))
    assert load(repo).model_dump() == RepoConfig().model_dump()
    assert db.fetch_one("SELECT config FROM repos")["config"] is None  # nothing cached from a failed fetch

    db.execute("UPDATE repos SET config = %s", (repo_config.Jsonb(parse_config("comments: true").model_dump()),))
    assert load(repo, refresh=True).comments is True  # keeps the cached copy when refresh fails


def test_yaml_booleans_for_mode():
    assert parse_config("features: {spam: {mode: off}}").mode("spam") == "off"  # YAML 1.1 reads bare off/no as false
    assert parse_config("features: {routing: {mode: no}}").mode("routing") == "off"
    for word in ("on", "yes", "true"):  # ...and on/yes/true as true: say what to write instead of guessing
        with pytest.raises(ValueError, match='features.routing.mode.*write the mode in quotes: "auto"'):
            parse_config("features: {routing: {mode: %s}}" % word)


def test_render_yaml_quotes_modes_so_off_round_trips():
    data = RepoConfig().model_dump(mode="json")
    text = render_yaml(data)
    assert 'mode: "off"' in text and 'mode: "shadow"' in text and "mode: off" not in text and "mode: shadow" not in text
    assert yaml.safe_load(text)["features"]["spam"]["mode"] == "off"
    assert parse_config(text).model_dump() == RepoConfig().model_dump()
    assert render_yaml({"model": "x", "areas": {"mode": {"owner": "a"}}}).count('"') == 0  # only `mode: <string>` values are quoted


def test_load_stores_config_error_and_clears_it(monkeypatch, repo):
    fake = FakeGH({("acme/widgets", ".github/jev-triage.yml"): ("features: {spam: {mode: on}}", "s1")})
    monkeypatch.setattr(repo_config, "client_for", lambda r: fake)
    load(repo)
    row = db.fetch_one("SELECT config_source, config_error FROM repos")
    assert row["config_source"] == "default" and "features.spam.mode" in row["config_error"]
    fake.files[("acme/widgets", ".github/jev-triage.yml")] = ('features: {spam: {mode: "auto"}}', "s2")
    assert load(repo, refresh=True).mode("spam") == "auto"
    assert db.fetch_one("SELECT config_source, config_error FROM repos") == {"config_source": "repo", "config_error": None}
