"""PR checks: exact facts in code (tests/docs changed, diff size), judgment calls (breaking, follows rules) from Jev.
Auto mode posts one neutral check run and manages needs_tests / needs_docs / breaking labels. Never blocks a merge."""
import re

from app import actions, github, pipeline
from app.pipeline import settle
from app.questions import spec

FEATURE = "pr_checks"
TEST_RE = re.compile(r"(^|/)(tests?|__tests__)/|(^|/)test_[^/]*\.py$|_test\.go$|\.(spec|test)\.[^/]+$")
DOC_RE = re.compile(r"(^|/)docs/|\.(md|rst)$", re.I)
CODE_RE = re.compile(r"\.(py|js|ts|tsx|jsx|go|rs|java|kt|rb|php|c|h|cc|cpp|hpp|cs|swift|scala|ex|sh)$")
FOLLOWS = {"0": "no", "1": "partly", "2": "yes"}  # pr.follows_rules score levels


def enabled(ctx) -> bool:
    return ctx.item["kind"] == "pr"


def _files(ctx) -> list:
    if "pr_files" not in ctx.extra:
        ctx.extra["pr_files"] = github.client_for(ctx.repo).get_pr_files(ctx.repo["full_name"], ctx.item["github_number"])
    return ctx.extra["pr_files"]


def _facts(ctx) -> dict:
    names = [f["filename"] for f in _files(ctx)]
    return {
        "tests": any(TEST_RE.search(n) for n in names),
        "docs": any(DOC_RE.search(n) for n in names),
        "source": any(CODE_RE.search(n) and not TEST_RE.search(n) and not DOC_RE.search(n) for n in names),
        "additions": sum(f.get("additions", 0) for f in _files(ctx)),
        "deletions": sum(f.get("deletions", 0) for f in _files(ctx)),
        "files": len(names),
    }


def state(ctx) -> dict:
    files = _files(ctx)
    lines = [f"- {f['filename']} (+{f.get('additions', 0)}/-{f.get('deletions', 0)})" for f in files[:200]]
    if len(files) > 200:
        lines.append(f"... and {len(files) - 200} more files")
    budget, patches = 4000, []
    for f in files:
        if f.get("patch") and budget > 0:
            patches.append(f"### {f['filename']}\n{f['patch'][:budget]}")
            budget -= len(f["patch"])
    out = {"Changed files": "\n".join(lines + patches)}
    if ctx.repo.get("rules_text"):
        out["Contributing rules"] = ctx.repo["rules_text"][:4000]
    return out


def questions(ctx) -> list:
    return [spec("pr.breaking")] + ([spec("pr.follows_rules")] if ctx.repo.get("rules_text") else [])


def apply(ctx, verdicts: dict) -> None:
    cfg, f = ctx.config, _facts(ctx)
    auto = cfg.mode(FEATURE) == "auto" and ctx.actions_enabled
    present = {x["name"] if isinstance(x, dict) else x for x in ctx.extra["payload"].get("labels") or []}
    wants_docs = bool(re.search(r"\bdocs?\b|documentation", ctx.repo.get("rules_text") or "", re.I))
    if auto:  # exact checks: deterministic, no verdict, so no decision to attach
        for key, needed in (("needs_tests", f["source"] and not f["tests"]),
                            ("needs_docs", wants_docs and f["source"] and not f["docs"])):
            if needed:
                pipeline.label(ctx, key)
            elif cfg.label(key) in present:
                actions.unlabel(ctx.item, ctx.repo, cfg.label(key), None)

    lines = []
    b = verdicts.get("pr.breaking")
    if b:
        d = settle(ctx, b, actionable=b.answer == "true" or b.eligible)  # eligible answers are reported in the check run
        if d == "act" and b.answer == "true":
            pipeline.label(ctx, "breaking", None, b.decision_id)
        if b.eligible:
            lines.append(f"- Breaking change: {'yes' if b.answer == 'true' else 'no'} (confidence {b.confidence:.0%})")
    r = verdicts.get("pr.follows_rules")
    if r:
        settle(ctx, r, actionable=r.answer != "2" or r.eligible)
        if r.eligible:
            lines.append(f"- Follows contributing rules: {FOLLOWS.get(r.answer, r.answer)} (confidence {r.confidence:.0%})")
    sha = ctx.item["extra"].get("head_sha")
    if auto and sha:
        summary = ["**Checks**", f"- Tests changed: {'yes' if f['tests'] else 'no'}", f"- Docs changed: {'yes' if f['docs'] else 'no'}",
                   f"- Size: {f['files']} files, +{f['additions']}/-{f['deletions']}", "", "**Jev**", *(lines or ["- no confident answers"])]
        first = b or r
        actions.check_run(ctx.item, ctx.repo, sha, "OSS Inbox", "\n".join(summary), first.decision_id if first else None)
