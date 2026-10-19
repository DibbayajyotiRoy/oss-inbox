"""CI gate: dedupe a CI failure against open issues, then file / merge / flag / queue it (never close anything)."""
import logging
import re

from psycopg.types.json import Jsonb

from app import actions, db, engine, notify, pipeline, ratelimit, repo_config, retrieval
from app.questions import QUESTIONS, base_id, spec

log = logging.getLogger(__name__)

ACTING = ("merged", "flaky", "infra", "filed")
EXTERNAL_QUESTIONS = ["gate.reproducible", "gate.grounded", "gate.known_non_issue", "gate.claim_supported",
                      "gate.security_claim"]
# external answers that mean "don't let this near the tracker"
HOLD_IF = (("gate.security_claim", "true"), ("gate.grounded", "false"), ("gate.known_non_issue", "true"))


def _facts(repo: dict) -> str:
    s = f"{repo['full_name']}: {repo['description']}"
    try:
        from app.github import client_for
        # ponytail: first 300 paths alphabetically; rank by relevance to the report if grounding misfires on big repos
        s += "\nFiles:\n" + "\n".join(sorted(client_for(repo).get_tree_paths(repo["full_name"]))[:300])
    except Exception as e:
        log.warning("repo facts unavailable: %s", e)
    return s


def _state(p: dict, repo: dict, config, ci: bool) -> str:
    s = f"## Title\n{p['title']}\n\n## Body\n{p['body'][:6000]}"
    if p.get("failing_test"):
        s += f"\n\n## Failing test\n{p['failing_test']}"
    if p.get("log_excerpt"):
        s += f"\n\n## Log excerpt\n{p['log_excerpt'][:3000]}"
    if config.areas:
        s += "\n\n## Areas\n" + "\n".join(f"- {n}: {a.description}" for n, a in config.areas.items())
    if not ci:
        s += f"\n\n## Repository facts\n{_facts(repo)}"
        if repo.get("rules_text"):
            s += f"\n\n## Contributing rules\n{repo['rules_text'][:4000]}"
    return s


def _issue_body(p: dict) -> str:
    meta = [f"**{k}:** {v}" for k, v in (("Run", p.get("run_url")), ("Commit", p.get("commit_sha")),
                                          ("Failing test", p.get("failing_test") and p["failing_test"].replace("`", "'")))
            if v]
    out = "\n\n".join([p["body"][:20000], "\n".join(meta)]).strip()
    if log_ := (p.get("log_excerpt") or "")[:4000]:
        fence = "`" * max(3, max((len(m) for m in re.findall(r"`+", log_)), default=0) + 1)
        out += f"\n\n{fence}\n{log_}\n{fence}"
    return out + "\n\n_Filed automatically by OSS Inbox CI gate._"


def _intent(verdicts: dict, cands: list[dict], ci: bool):
    """What we would do if allowed: (outcome, key verdict, reason-if-queued)."""
    if not ci:
        for qid, ans in HOLD_IF:
            if (v := verdicts.get(qid)) and v.above and v.answer == ans:
                return "held", v, f"{qid}={ans}"
        return "queued", None, "no strong signal"
    num = {f"ci.same_as#{c['id']}": c["github_number"] for c in cands}
    same = [v for v in verdicts.values() if base_id(v.question_id) == "ci.same_as" and v.answer == "true"]
    if dup := max((v for v in same if v.above), key=lambda v: v.confidence, default=None):
        return "merged", dup, ""
    kind = verdicts.get("ci.kind")
    if kind and kind.above:
        if kind.answer == "flaky_test":
            return "flaky", kind, ""
        if kind.answer == "infrastructure":
            return "infra", kind, ""
        if not same:
            return "filed", kind, ""
        return "queued", None, f"possible duplicate of #{num.get(max(same, key=lambda v: v.confidence).question_id)}"
    return "queued", None, "ci.kind below threshold" if kind else "no decision"


def _act(outcome: str, key, p: dict, repo: dict, config, cands: list[dict], verdicts: dict) -> dict:
    """Perform the action. Returns outcome/reason/issue_number/merged_into, and the verdicts it used."""
    out = {"outcome": outcome, "reason": "", "issue_number": None, "merged_into": None, "used": {key.question_id}}
    if outcome == "merged":
        cand = next(c for c in cands if f"ci.same_as#{c['id']}" == key.question_id)
        out["merged_into"] = cand["github_number"]
        if config.comments:
            actions.comment(cand, repo, f"OSS Inbox: this failure occurred again"
                            f"{' (' + p['run_url'] + ')' if p.get('run_url') else ''}.", key.decision_id, "ci_occurrence")
    elif outcome == "flaky":
        db.execute("""INSERT INTO flaky_tests (repo_id, test_id, occurrences, last_run_url) VALUES (%s, %s, 1, %s)
                      ON CONFLICT (repo_id, test_id) DO UPDATE SET occurrences = flaky_tests.occurrences + 1,
                      last_seen = now(), last_run_url = EXCLUDED.last_run_url""",
                   (repo["id"], p.get("failing_test") or p["title"], p.get("run_url")))
    elif outcome == "infra":
        notify.send(config.ci_gate.notify_webhook_url,
                    f"[{repo['full_name']}] CI infrastructure failure: {p['title'][:200]} {p.get('run_url') or ''}")
    elif outcome == "filed":
        if not ratelimit.allow(f"ci_file:{repo['id']}", config.ci_gate.max_issues_per_hour, 3600):
            return out | {"outcome": "rate_limited", "reason": f"issue limit reached ({config.ci_gate.max_issues_per_hour}/hour)"}
        labels = [config.label("ci")]
        for qid in ("priority", "route.area"):
            if (v := verdicts.get(qid)) and v.eligible:  # not decide(): that queues the item as a side effect
                labels.append(config.label(qid, v.answer))
                out["used"].add(qid)
        issue = actions.file_issue(repo, p["title"], _issue_body(p), [x for x in labels if x], key.decision_id)
        out["issue_number"] = issue.get("number")
        if out["issue_number"]:  # make it findable, so the next occurrence merges instead of filing again
            pipeline.upsert_item(repo, "issue", issue["number"], p["title"], p["body"], None, None,
                                 issue.get("html_url"), "ci_agent")
    else:  # held (external report)
        notify.send(config.ci_gate.notify_webhook_url,
                    f"[{repo['full_name']}] report held for review ({key.question_id}): {p['title'][:200]}")
    return out


def process_report(report_id: int) -> dict:
    rep = db.fetch_one("SELECT * FROM ci_reports WHERE id = %s", (report_id,))
    repo = db.fetch_one("SELECT * FROM repos WHERE id = %s", (rep["repo_id"],))
    item = db.fetch_one("SELECT * FROM items WHERE id = %s", (rep["item_id"],))
    config = repo_config.load(repo)
    p, ci = rep["payload"], rep["source"] == "ci"
    feature = "ci_gate" if ci else "inbound_gate"
    ctx = pipeline.Ctx(repo=repo, config=config, item=item, trigger="ci_gate")
    verdicts, cands, used = {}, [], set()
    shadow = config.mode(feature) == "shadow"
    res = {"outcome": "queued", "reason": "disabled", "issue_number": None, "merged_into": None}

    if config.mode(feature) != "off":
        if ci:
            cands = retrieval.similar(repo["id"], f"{p['title']}\n{p.get('failing_test') or ''}\n{p.get('log_excerpt') or ''}\n{p['body']}")
            qs = [spec("ci.kind"), spec("priority")]
            if config.areas:
                qs.append(spec("route.area", criteria={n: a.description or None for n, a in config.areas.items()}))
            qs += [spec("ci.same_as", suffix=c["id"], instructions={
                "candidate": f"#{c['github_number']} {c['title']}\n{c['body'][:1500]}",
                "question": QUESTIONS["ci.same_as"].instructions}) for c in cands]
        else:
            qs = [spec(q) for q in EXTERNAL_QUESTIONS]
        _, verdicts, err = engine.run(item, repo, config, "ci_gate", _state(p, repo, config, ci), qs)
        for c in cands:
            v = verdicts.get(f"ci.same_as#{c['id']}")
            db.execute("""INSERT INTO ci_candidates (report_id, candidate_item_id, retrieval_score, same_as_probability)
                          VALUES (%s, %s, %s, %s) ON CONFLICT (report_id, candidate_item_id)
                          DO UPDATE SET retrieval_score = EXCLUDED.retrieval_score,
                          same_as_probability = EXCLUDED.same_as_probability""",
                       (report_id, c["id"], c["score"], v and v.probabilities.get("true")))
        outcome, key, reason = ("queued", None, f"decision error: {err}") if err else _intent(verdicts, cands, ci)
        if outcome != "queued":
            d = pipeline.decide(ctx, key)
            if d != "act":
                outcome, reason = "queued", f"{'shadow' if d == 'shadow' else 'not eligible'}: would be {outcome}"
        res = {"outcome": outcome, "reason": reason, "issue_number": None, "merged_into": None}
        if outcome != "queued":
            try:
                res = _act(outcome, key, p, repo, config, cands, verdicts)
                res["reason"] = res["reason"] or reason
                used = res["used"]
            except Exception as e:  # e.g. GitHub down: keep the report, let a human decide
                log.exception("ci_gate action %s failed", outcome)
                res = {**res, "outcome": "queued", "reason": f"action failed ({outcome}): {str(e)[:200]}"}

        if res["outcome"] in ACTING:
            for v in verdicts.values():
                engine.set_outcome(v.decision_id, "acted" if v.question_id in used else "skipped")
        else:
            for v in verdicts.values():
                engine.set_outcome(v.decision_id, "shadow" if shadow else "queued")
            pipeline.enqueue_review(item["id"], feature, res["reason"], bucket="held" if res["outcome"] == "held" else "review")

    db.execute("UPDATE ci_reports SET outcome = %s, filed_issue_number = %s, merged_into_number = %s WHERE id = %s",
               (res["outcome"], res["issue_number"], res["merged_into"], report_id))
    return {"report_id": report_id, "outcome": res["outcome"], "reason": res["reason"], "issue_number": res["issue_number"],
            "merged_into": res["merged_into"], "decision_ids": [v.decision_id for v in verdicts.values()],
            "shadow": shadow}
