"""Inbound gate for issues from outside the core team: hold unsafe/ungrounded reports, suggest duplicates, ask for repro."""
import logging
import re

from app import actions, github, notify, pipeline, retrieval
from app.pipeline import settle
from app.questions import QUESTIONS, spec
from app.redis_client import redis

log = logging.getLogger(__name__)
FEATURE = "inbound_gate"
EXT = "py|js|ts|tsx|jsx|go|rs|java|kt|rb|php|c|h|cc|cpp|hpp|cs|swift|sh|md|rst|txt|yml|yaml|json|toml|ini|cfg|sql|html|css"
# Bare and backticked paths alike; identifiers can't be checked against a file tree, so only paths are verified.
PATH_RE = re.compile(rf"(?<![\w.:-])((?:[\w.-]*/)*[\w-]+\.(?:{EXT}))(?![\w/-])")
# (question, answer that triggers a hold, reason)
HOLDS = (("gate.security_claim", "true", "possible security report"),
         ("gate.grounded", "false", "references files that don't exist in the repository"),
         ("gate.known_non_issue", "true", "describes documented or already rejected behavior"))


def enabled(ctx) -> bool:
    return (ctx.item["kind"] == "issue" and ctx.trigger != "release"
            and ctx.item["author_association"] not in ctx.config.core_team)


def _facts(ctx) -> str | None:
    if "gate_facts" not in ctx.extra:
        text = re.sub(r"https?://\S+", " ", f"{ctx.item['title']}\n{ctx.item['body']}")
        refs = list(dict.fromkeys(m.removeprefix("./").lstrip("/") for m in PATH_RE.findall(text)))[:15]
        facts = None
        if refs:
            try:
                tree = github.client_for(ctx.repo).get_tree_paths(ctx.repo["full_name"])
            except Exception:
                log.warning("tree fetch failed for %s", ctx.repo["full_name"], exc_info=True)
            else:
                found = [r for r in refs if r in tree or any(p.endswith("/" + r) for p in tree)]
                missing = [r for r in refs if r not in found]
                facts = f"Referenced paths found: {', '.join(found) or 'none'}; not found: {', '.join(missing) or 'none'}"
        ctx.extra["gate_facts"] = facts
    return ctx.extra["gate_facts"]


def state(ctx) -> dict:
    facts = _facts(ctx)
    return {"Repository facts": facts} if facts else {}


def questions(ctx) -> list:
    qs = [spec(q) for q in ("gate.reproducible", "gate.known_non_issue", "gate.claim_supported", "gate.security_claim")]
    if _facts(ctx):  # without file references there's nothing to ground against
        qs.append(spec("gate.grounded"))
    ask = QUESTIONS["gate.same_as"].instructions
    for c in retrieval.similar(ctx.repo["id"], f"{ctx.item['title']}\n{ctx.item['body']}", k=5,
                               exclude_item_id=ctx.item["id"], open_only=False):
        n = c["github_number"]
        qs.append(spec("gate.same_as", suffix=n,
                       instructions={"candidate": f"#{n} {c['title']}\n{(c['body'] or '')[:1500]}", "question": ask}))
    return qs


def _hold(ctx, v, reason: str, unsupported: bool) -> None:
    ctx.held = True
    pipeline.label(ctx, "held", None, v.decision_id)
    pipeline.enqueue_review(ctx.item["id"], FEATURE, reason + (", no supporting evidence" if unsupported else ""), "held")
    url = ctx.config.ci_gate.notify_webhook_url
    # Alert about the report, never its text (it may describe an unpatched vulnerability); once per item per day.
    if v.question_id == "gate.security_claim" and url and redis.set(f"jev:held-alert:{ctx.item['id']}", "1", nx=True, ex=86400):
        notify.send(url, f"Possible security report held in {ctx.repo['full_name']}: {ctx.item['html_url']}")


def _flag(v, answer: str) -> bool:
    return v is not None and v.answer == answer and v.above


def apply(ctx, verdicts: dict) -> None:
    for qid, v in verdicts.items():  # duplicates are suggestions, never linked automatically
        if qid.startswith("gate.same_as#"):
            if _flag(v, "true"):
                pipeline.suggest(ctx, v, f"possible duplicate of #{qid.split('#', 1)[1]}")
            else:
                settle(ctx, v, actionable=False)
    unsupported = _flag(verdicts.get("gate.claim_supported"), "false")
    ungrounded = _flag(verdicts.get("gate.grounded"), "false")
    if "gate.claim_supported" in verdicts:  # only colors the hold reason
        settle(ctx, verdicts["gate.claim_supported"], actionable=False)
    for qid, bad, reason in HOLDS:
        v = verdicts.get(qid)
        if v is None:
            continue
        if v.answer != bad:
            settle(ctx, v, actionable=False)
        elif settle(ctx, v) == "act" and not ctx.held:
            _hold(ctx, v, reason, unsupported)
    r = verdicts.get("gate.reproducible")
    if r is None:
        return
    if r.answer == "false" and not ctx.held and not ungrounded and settle(ctx, r) == "act":
        pipeline.label(ctx, "needs_info", None, r.decision_id)
        if ctx.config.comments:  # shares the "needs-info" comment with issue_triage (actions.comment edits it)
            actions.comment(ctx.item, ctx.repo, "Thanks for the report! Could you add steps to reproduce the problem?",
                            r.decision_id, "needs-info:repro")
    elif r.answer != "false" or ctx.held or ungrounded:
        settle(ctx, r, actionable=False)
