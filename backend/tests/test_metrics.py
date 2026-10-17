from datetime import datetime, timedelta, timezone

import pytest

from app import db, metrics

_n = iter(range(1, 10_000))


def seed(repo, answer, conf, truth=None, qid="issue.type", trigger="webhook", outcome="shadow", error=None, created=None,
         item_id=None):
    """One item with one run + decision (+ truth). Returns (item_id, decision_id)."""
    created = created or datetime.now(timezone.utc)
    if item_id is None:
        item_id = db.fetch_one(
            "INSERT INTO items (repo_id, kind, github_number, title, html_url, source, created_at) "
            "VALUES (%s, 'issue', %s, %s, %s, 'webhook', %s) RETURNING id",
            (repo["id"], next(_n), "t", "http://x", created))["id"]
    run = db.fetch_one(
        "INSERT INTO decision_runs (item_id, trigger, backend, state_hash, error, created_at) "
        "VALUES (%s, %s, 'jev', 'h', %s, %s) RETURNING id", (item_id, trigger, error, created))["id"]
    did = db.fetch_one(
        "INSERT INTO decisions (run_id, item_id, repo_id, question_id, base_question, answer, probabilities, confidence, "
        "threshold_at_time, outcome, created_at) VALUES (%s, %s, %s, %s, %s, %s, '{}', %s, 0.8, %s, %s) RETURNING id",
        (run, item_id, repo["id"], qid, qid.split("#")[0], answer, conf, outcome, created))["id"]
    if truth:
        db.execute("INSERT INTO ground_truth (item_id, question_id, answer, source) VALUES (%s, %s, %s, 'backfill') "
                   "ON CONFLICT DO NOTHING", (item_id, qid, truth))
    return item_id, did


def test_stats_ece_and_cache(repo):
    for i in range(5):  # conf .9, 4 of 5 right
        seed(repo, "bug", 0.9, "bug" if i < 4 else "docs")
    for i in range(5):  # conf .6, 3 of 5 right
        seed(repo, "bug", 0.6, "bug" if i < 3 else "docs")
    seed(repo, "bug", 0.99)  # no truth: ignored
    s = metrics.question_stats(repo["id"], "issue.type")
    assert (s.n, s.accuracy) == (10, pytest.approx(0.7))
    assert s.ece == pytest.approx(0.5 * abs(0.8 - 0.9) + 0.5 * abs(0.6 - 0.6))
    seed(repo, "bug", 0.9, "bug")
    assert metrics.question_stats(repo["id"], "issue.type").n == 10  # cached 60s
    assert len(metrics.calibration(repo["id"], "issue.type")) == 10
    assert metrics.question_stats(repo["id"], "priority") == metrics.QuestionStats("priority", 0, None, None)


def test_calibration_bins(repo):
    seed(repo, "a", 0.95, "a")
    seed(repo, "a", 1.0, "b")
    seed(repo, "a", 0.55, "a")
    b = metrics.calibration(repo["id"], "issue.type", bins=5)
    assert [x["n"] for x in b] == [0, 0, 1, 0, 2]
    assert b[4]["accuracy"] == 0.5 and b[4]["mean_confidence"] == pytest.approx(0.975)
    assert (b[0]["lo"], b[0]["hi"], b[0]["accuracy"], b[0]["mean_confidence"]) == (0.0, 0.2, None, None)


def test_latest_error_free_decision_wins(repo):
    item, _ = seed(repo, "docs", 0.9, "bug", created=datetime.now(timezone.utc) - timedelta(hours=3))  # old, wrong
    seed(repo, "bug", 0.8, item_id=item, created=datetime.now(timezone.utc) - timedelta(hours=2))  # newer, right
    seed(repo, "docs", 0.99, item_id=item, error="boom")  # newest but its run failed
    s = metrics.question_stats(repo["id"], "issue.type")
    assert (s.n, s.accuracy) == (1, 1.0)


def test_per_candidate_question_uses_full_id(repo):
    seed(repo, "true", 0.9, "true", qid="gate.same_as#12")
    seed(repo, "true", 0.9, "false", qid="gate.same_as#13")
    assert metrics.question_stats(repo["id"], "gate.same_as").n == 2
    assert metrics.confusion(repo["id"], "gate.same_as")["matrix"] == [[0, 1], [0, 1]]


def test_confusion_misses_preview(repo):
    seed(repo, "bug", 0.9, "bug")
    _, wrong_hi = seed(repo, "bug", 0.95, "docs")
    seed(repo, "feature", 0.7, "bug")
    seed(repo, "docs", 0.6)  # unlabelled
    assert metrics.confusion(repo["id"], "priority") is None
    c = metrics.confusion(repo["id"], "issue.type")
    assert c == {"labels": ["bug", "docs", "feature"], "matrix": [[1, 0, 1], [1, 0, 0], [0, 0, 0]]}
    m = metrics.worst_misses(repo["id"], "issue.type", limit=1)
    assert len(m) == 1 and (m[0]["answer"], m[0]["truth"], m[0]["confidence"]) == ("bug", "docs", 0.95)
    assert set(m[0]) == {"item_id", "number", "title", "answer", "truth", "confidence", "html_url"}
    assert m[0]["html_url"] == "http://x"
    pts = metrics.preview_points(repo["id"], "issue.type")
    assert len(pts) == 4 and sorted(p["truth"] or "" for p in pts) == ["", "bug", "bug", "docs"]
    assert pts[0]["answer"] == "docs"  # newest first


def test_recommended_threshold(repo):
    for _ in range(10):
        seed(repo, "bug", 0.9, "bug")
    for i in range(10):
        seed(repo, "bug", 0.6, "bug" if i % 2 else "docs")
    assert metrics.recommended_threshold(repo["id"], "issue.type") == 0.61
    assert metrics.recommended_threshold(repo["id"], "issue.type", max_error=0.3) == 0.5
    assert metrics.recommended_threshold(repo["id"], "priority") is None
    seed(repo, "bug", 0.9, "docs", qid="priority")
    assert metrics.recommended_threshold(repo["id"], "priority") is None  # fewer than 10 points


def test_overview(org, repo):
    other = db.fetch_one("INSERT INTO repos (org_id, github_repo_id, full_name) VALUES (%s, 2002, 'acme/zeta') RETURNING *",
                         (org["id"],))
    now = datetime.now(timezone.utc)
    i1, d1 = seed(repo, "bug", 0.9, "bug", outcome="acted")
    i2, d2 = seed(repo, "bug", 0.9, "docs", outcome="queued")
    seed(repo, "p1", 0.9, qid="priority", outcome="shadow", item_id=i2)
    seed(repo, "bug", 0.9, outcome="shadow", created=now - timedelta(days=2))
    seed(repo, "bug", 0.9, "bug", trigger="backfill", created=now - timedelta(days=400))
    db.execute("INSERT INTO overrides (decision_id, user_login, new_answer) VALUES (%s, 'm', 'docs')", (d2,))
    db.execute("INSERT INTO queue_items (item_id, repo_id, feature, reason) VALUES (%s, %s, 'issue_triage', 'r')", (i1, repo["id"]))
    db.execute("INSERT INTO queue_items (item_id, repo_id, feature, reason, bucket) VALUES (%s, %s, 'inbound_gate', 'r', 'held')",
               (i2, repo["id"]))
    db.execute("INSERT INTO queue_items (item_id, repo_id, feature, reason, status) VALUES (%s, %s, 'x', 'r', 'dismissed')",
               (i1, repo["id"]))

    first, second = metrics.overview(org["id"], days=30)
    assert [first["full_name"], second["full_name"]] == ["acme/widgets", "acme/zeta"]
    assert second["items_30d"] == 0 and second["acted_share"] is None and second["accuracy"] is None
    assert second["override_rate"] is None and second["queued_open"] == 0 and len(second["trend"]) == 30
    assert first["items_30d"] == 3  # the 400-day-old backfill item is outside the window
    assert first["acted_share"] == pytest.approx(1 / 3)  # 3 items with live decisions, 1 acted
    assert (first["queued_open"], first["held_open"]) == (1, 1)
    assert first["accuracy"] == pytest.approx(2 / 3)  # bug/bug right, bug/docs wrong, backfill bug/bug right... latest per item
    assert first["override_rate"] == pytest.approx(1 / 4)
    t = {x["date"]: x for x in first["trend"]}
    assert len(first["trend"]) == 30 and first["trend"][-1]["date"] == now.strftime("%Y-%m-%d")
    assert (first["trend"][-1]["acted"], first["trend"][-1]["queued"], first["trend"][-1]["shadow"]) == (1, 1, 1)
    assert t[(now - timedelta(days=2)).strftime("%Y-%m-%d")]["shadow"] == 1
    assert (first["private"], first["enabled"]) == (False, True)
