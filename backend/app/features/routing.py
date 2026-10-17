"""Routing: area label + owner assignment from config areas; suggests (never performs) a move to another org repo."""
from app import actions, db, pipeline
from app.pipeline import settle
from app.questions import spec

FEATURE = "routing"
NONE = "none"


def enabled(ctx) -> bool:
    return True


def _repos(ctx) -> list:
    if "route_repos" not in ctx.extra:
        ctx.extra["route_repos"] = db.fetch_all(
            "SELECT full_name, description FROM repos WHERE org_id = %s AND enabled ORDER BY full_name", (ctx.repo["org_id"],))
    return ctx.extra["route_repos"]


def _route_repo(ctx) -> bool:
    return ctx.item["kind"] == "issue" and len(_repos(ctx)) > 1


def state(ctx) -> dict:
    out = {}
    if ctx.config.areas:
        out["Areas"] = "\n".join(f"- {n}: {a.description} (paths: {', '.join(a.paths) or 'n/a'})" for n, a in ctx.config.areas.items())
    if _route_repo(ctx):
        out["Repositories"] = "\n".join(f"- {r['full_name']}: {r['description']}" for r in _repos(ctx))
    return out


def questions(ctx) -> list:
    qs = []
    if ctx.config.areas:
        criteria = {n: a.description or None for n, a in ctx.config.areas.items()}
        criteria[NONE] = "Does not clearly belong to any listed area"
        qs.append(spec("route.area", criteria=criteria))
    if _route_repo(ctx):
        qs.append(spec("route.repo", criteria={r["full_name"]: r["description"] or None for r in _repos(ctx)}))
    return qs


def apply(ctx, verdicts: dict) -> None:
    a = verdicts.get("route.area")
    if a:
        area = ctx.config.areas.get(a.answer)
        if settle(ctx, a, actionable=area is not None) == "act":
            pipeline.label(ctx, "route.area", a.answer, a.decision_id)
            owner = (area.owner or "").lstrip("@")
            if owner and "/" not in owner:  # a team handle can't be an assignee
                actions.assign(ctx.item, ctx.repo, [owner], a.decision_id)
    r = verdicts.get("route.repo")
    if r:
        if r.answer != ctx.repo["full_name"] and r.above:
            pipeline.suggest(ctx, r, f"belongs in {r.answer}")
        else:
            settle(ctx, r, actionable=False)
