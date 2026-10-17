"""Item pipeline: upsert item -> build state -> ONE engine call -> apply features in order.

Feature modules (app.features.*) export FEATURE, enabled(ctx), questions(ctx), apply(ctx, verdicts) and optionally
state(ctx) -> {section title: text}. A module owning several features also exports FEATURES (priority_spam: priority + spam);
it runs when any of them is not "off", asks only for the non-off ones and receives verdicts for all of its features.
Helpers features share: decide, settle, suggest, label, own, enqueue_review.
"""
import logging
import re
from dataclasses import dataclass, field
from importlib import import_module
from typing import Any

from psycopg.types.json import Jsonb

from app import actions, db, engine, repo_config
from app.questions import QUESTIONS, base_id

log = logging.getLogger(__name__)
ORDER = ("inbound_gate", "issue_triage", "pr_checks", "priority_spam", "routing")  # gate first: it can hold the item
OUTCOME = {"act": "acted", "queue": "queued", "shadow": "shadow", "skip": "skipped"}


@dataclass
class Ctx:
    repo: dict
    config: Any  # repo_config.RepoConfig
    item: dict
    trigger: str
    extra: dict = field(default_factory=dict)  # extra["payload"] is the GitHub issue/PR object
    held: bool = False
    actions_enabled: bool = True  # False for backfill: record decisions only


def upsert_item(repo, kind, number, title, body, author, association, url, source, state="open", created_at=None,
                extra=None) -> dict:
    return db.fetch_one(
        """INSERT INTO items (repo_id, kind, github_number, title, body, author, author_association, html_url, state, source,
                              extra, created_at)
           VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, coalesce(%s::timestamptz, now()))
           ON CONFLICT (repo_id, kind, github_number) WHERE github_number IS NOT NULL DO UPDATE SET
             title = EXCLUDED.title, body = EXCLUDED.body, author = EXCLUDED.author,
             author_association = EXCLUDED.author_association, html_url = EXCLUDED.html_url, state = EXCLUDED.state,
             extra = items.extra || EXCLUDED.extra, updated_at = now()
           RETURNING *""",
        (repo["id"], kind, number, title, body, author, association, url, state, source, Jsonb(extra or {}), created_at))


def enqueue_review(item_id: int, feature: str, reason: str, bucket: str = "review") -> int:
    """One open row per (item, bucket); an existing open row keeps its original reason."""
    row = db.fetch_one(
        """INSERT INTO queue_items (item_id, repo_id, feature, reason, bucket)
           SELECT id, repo_id, %s, %s, %s FROM items WHERE id = %s
           ON CONFLICT (item_id, bucket) WHERE status = 'open' DO NOTHING RETURNING id""",
        (feature, reason, bucket, item_id))
    return (row or db.fetch_one("SELECT id FROM queue_items WHERE item_id = %s AND bucket = %s AND status = 'open'",
                                (item_id, bucket)))["id"]


def _feature(v) -> str:
    return QUESTIONS[base_id(v.question_id)].feature


def decide(ctx: Ctx, v) -> str:
    """'act' | 'queue' | 'shadow' for one verdict (CONTRACT rules 1-2); queues the item when a human should look."""
    feature, mode = _feature(v), ctx.config.mode(_feature(v))
    if not ctx.actions_enabled or mode == "off":
        return "shadow"
    if mode == "shadow":
        enqueue_review(ctx.item["id"], feature, "shadow: suggested answers")
        return "shadow"
    if v.eligible:
        return "act"
    why = "below threshold" if not v.above else "above threshold but accuracy not yet measured"
    enqueue_review(ctx.item["id"], feature, f"{v.question_id}: {v.answer} ({v.confidence:.0%}), {why} ({v.threshold:.0%})")
    return "queue"


def settle(ctx: Ctx, v, actionable: bool = True) -> str:
    """decide() + record the outcome. actionable=False (nothing to do for this answer) only queues in shadow mode,
    where every item is queued with its suggested answers; in auto mode a no-op answer never bothers a human."""
    shadow = ctx.config.mode(_feature(v)) == "shadow"
    if actionable or shadow:
        d = decide(ctx, v)
    else:
        d = "skip" if ctx.actions_enabled else "shadow"
    engine.set_outcome(v.decision_id, OUTCOME[d])
    return d


def suggest(ctx: Ctx, v, reason: str, bucket: str = "review") -> None:
    """Verdict that only ever queues a suggestion (duplicate link, move to another repo); never acts."""
    mode = ctx.config.mode(_feature(v))
    if ctx.actions_enabled and mode != "off":
        enqueue_review(ctx.item["id"], _feature(v), reason, bucket)
    engine.set_outcome(v.decision_id, "queued" if ctx.actions_enabled and mode == "auto" else "shadow")


def label(ctx: Ctx, key: str, answer: str | None = None, decision_id: int | None = None) -> None:
    name = ctx.config.label(key, answer)
    if name:
        actions.label(ctx.item, ctx.repo, [name], decision_id)


def own(verdicts: dict, features) -> dict:
    return {k: v for k, v in verdicts.items() if QUESTIONS[base_id(k)].feature in features}


def _names(mod) -> tuple:
    return getattr(mod, "FEATURES", (mod.FEATURE,))


def _clean(text: str | None, limit: int) -> str:
    return re.sub(r"(?m)^#", r"\\#", (text or "")[:limit])  # untrusted text must not forge "## Section" headers


def _is_bot(user: dict) -> bool:
    return user.get("type") == "Bot" or (user.get("login") or "").endswith("[bot]")


def process(repo: dict, kind: str, payload: dict, trigger: str, actions_enabled: bool = True) -> int | None:
    user = payload.get("user") or {}
    if _is_bot(user):
        return None
    config = repo_config.load(repo)
    repo = db.fetch_one("SELECT * FROM repos WHERE id = %s", (repo["id"],))  # load() may have refreshed rules_text
    sha = (payload.get("head") or {}).get("sha")
    item = upsert_item(
        repo, kind, payload["number"], payload.get("title") or "", payload.get("body") or "", user.get("login"),
        payload.get("author_association"), payload.get("html_url"), "backfill" if trigger == "backfill" else "webhook",
        "merged" if payload.get("merged_at") or payload.get("merged") else payload.get("state") or "open",
        payload.get("created_at"), {"head_sha": sha} if sha else None)
    ctx = Ctx(repo, config, item, trigger, {"payload": payload}, actions_enabled=actions_enabled)
    if trigger == "release" and actions_enabled:
        label_name = config.label("held")
        if label_name:
            actions.unlabel(item, repo, label_name, None)

    mods = [m for m in (import_module(f"app.features.{n}") for n in ORDER)
            if any(config.mode(f) != "off" for f in _names(m)) and m.enabled(ctx)]
    sections = {"Title": _clean(item["title"], 500), "Body": _clean(item["body"], 6000)}
    questions = []
    for m in mods:
        if hasattr(m, "state"):
            for title, text in m.state(ctx).items():
                sections.setdefault(title, text)
        questions += m.questions(ctx)
    if not questions:
        return None
    state = "\n\n".join(f"## {title}\n{text}" for title, text in sections.items())

    run_id, verdicts, error = engine.run(item, repo, config, trigger, state, questions)
    if error:
        if actions_enabled:
            enqueue_review(item["id"], "pipeline", f"decision backend error: {error}")
        return run_id
    for m in mods:
        mine = own(verdicts, _names(m))
        if ctx.held and m.FEATURE != "inbound_gate":
            for v in mine.values():
                engine.set_outcome(v.decision_id, "skipped")
        else:
            m.apply(ctx, mine)
    return run_id
