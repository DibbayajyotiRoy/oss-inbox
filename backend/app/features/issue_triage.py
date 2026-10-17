"""Issue triage: type label, and a needs-info label (+ one comment, if enabled) when repro/version/logs are missing."""
from app import actions, pipeline
from app.pipeline import settle
from app.questions import spec

FEATURE = "issue_triage"
MISSING = {  # question -> (short name used in the dedupe key, what to ask for)
    "issue.has_repro": ("repro", "steps to reproduce the problem"),
    "issue.has_version": ("version", "the affected version"),
    "issue.has_logs": ("logs", "logs, a stack trace, or the exact error message"),
}


def enabled(ctx) -> bool:
    return ctx.item["kind"] == "issue"


def questions(ctx) -> list:
    return [spec(q) for q in ("issue.type", *MISSING)]


def apply(ctx, verdicts: dict) -> None:
    t = verdicts["issue.type"]
    if settle(ctx, t, actionable=ctx.config.label("issue.type", t.answer) is not None) == "act":
        pipeline.label(ctx, "issue.type", t.answer, t.decision_id)

    info = {q: verdicts[q] for q in MISSING}
    labels = {x["name"] if isinstance(x, dict) else x for x in ctx.extra["payload"].get("labels") or []}
    # an edit that now answers everything clears a needs-info label we (or a maintainer) put there
    filled = ctx.trigger == "edited" and ctx.config.label("needs_info") in labels and all(v.answer == "true" for v in info.values())
    decided = {q: settle(ctx, v, actionable=filled or v.answer == "false") for q, v in info.items()}
    missing = {q: v for q, v in info.items() if v.answer == "false" and decided[q] == "act"}
    if missing:
        first = next(iter(missing.values())).decision_id
        pipeline.label(ctx, "needs_info", None, first)
        if ctx.config.comments:
            names = sorted(MISSING[q][0] for q in missing)
            asks = "\n".join(f"- {text}" for _, text in sorted(MISSING[q] for q in missing))
            actions.comment(ctx.item, ctx.repo, f"Thanks for the report! To help us look into this, please add:\n\n{asks}",
                            first, "needs-info:" + ",".join(names))
    elif filled and all(d == "act" for d in decided.values()):
        actions.unlabel(ctx.item, ctx.repo, ctx.config.label("needs_info"), info["issue.has_repro"].decision_id)
