"""Two features in one module: `priority` (issue priority label) and `spam` (label only, never closes).
The pipeline treats a module with FEATURES as on when any of them isn't "off"; questions() asks only for the on ones."""
from app import pipeline
from app.pipeline import settle
from app.questions import spec

FEATURE = "priority"
FEATURES = ("priority", "spam")


def enabled(ctx) -> bool:
    return True


def questions(ctx) -> list:
    qs = []
    if ctx.config.mode("priority") != "off" and ctx.item["kind"] == "issue":
        qs.append(spec("priority"))
    if ctx.config.mode("spam") != "off":
        qs.append(spec("spam"))
    return qs


def apply(ctx, verdicts: dict) -> None:
    p = verdicts.get("priority")
    if p and settle(ctx, p, actionable=ctx.config.label("priority", p.answer) is not None) == "act":
        pipeline.label(ctx, "priority", p.answer, p.decision_id)
    s = verdicts.get("spam")
    if s and settle(ctx, s, actionable=s.answer == "true") == "act":
        pipeline.label(ctx, "spam", None, s.decision_id)
