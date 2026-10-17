"""`python -m app.cli demo`: seed org `demo-org` with ~60 days of believable triage history, so every dashboard screen
has something to show in DEMO_MODE. Idempotent (wipes demo-org first). Deterministic shape: random.Random(7); dates are
relative to now. The story: Jev was installed 35 days ago, backfilled the older closed items, then ran in shadow mode;
features were promoted to auto one by one once their accuracy looked right. Every GitHub action is dry-run.

Simplified from the real pipeline (app.pipeline / app.features.*): the same outcome rules, one function instead of five."""
import hashlib
import os
import random
import re
import secrets
from datetime import datetime, timedelta, timezone
from functools import partial

from psycopg.types.json import Jsonb

from app import db
from app.questions import QUESTIONS, base_id
from app.repo_config import parse_config, render_yaml
from app.settings import DEMO_ORG

TEAM = ["mira-k", "tobias-r", "priya-s", "jonas-w"]
CONTRIBUTORS = ["lena-ostrom", "dev-anand", "carlos-m", "yuki-t", "fatima-z", "ben-holloway", "noor-a", "sam-wickham",
                "ana-lucia", "viktor-p", "chloe-dubois", "ravi-n", "elif-k", "tom-hargrove", "isabel-r", "kofi-a"]
STRANGERS = ["throwaway2291", "user48213", "jdoe-dev", "acme-it-ops", "k4rma", "bluefox88", "new-to-oss", "sysadmin_greg",
             "anon-reporter", "maria-g", "cto-at-startup", "devops-dan", "hana-b", "diego-f", "oleg-s", "maya-l"]
INSTALL_DAYS = 35  # Jev was installed this long ago; older items arrived through the backfill
HARD = {"priority": .5, "route.area": .66, "pr.follows_rules": .55, "route.repo": .8, "issue.type": .74, "ci.kind": .78}  # P(confident band); default .84

_AREA = {  # owner, description, files
    "api": {
        "auth": ("mira-k", "API keys, OAuth, JWT validation and permissions",
                 ["src/orbit/auth/tokens.py", "src/orbit/auth/oauth.py", "src/orbit/auth/permissions.py"]),
        "database": ("tobias-r", "PostgreSQL models, migrations and the connection pool",
                     ["src/orbit/db/pool.py", "src/orbit/db/models.py", "migrations/0042_add_archived.sql"]),
        "http": ("priya-s", "Routing, middleware, pagination and rate limiting",
                 ["src/orbit/http/pagination.py", "src/orbit/http/middleware.py", "src/orbit/http/ratelimit.py"]),
        "webhooks": ("jonas-w", "Outbound webhooks: delivery, retries and signing",
                     ["src/orbit/webhooks/delivery.py", "src/orbit/webhooks/signing.py"]),
        "docs": ("priya-s", "Documentation, OpenAPI spec and examples",
                 ["docs/guides/pagination.md", "docs/openapi.yaml", "docs/guides/webhooks.md"]),
    },
    "web": {
        "components": ("priya-s", "Shared UI components: tables, pickers, modals, charts",
                       ["src/components/DataTable.tsx", "src/components/DatePicker.tsx", "src/components/Modal.tsx"]),
        "data": ("tobias-r", "Data fetching, caching and state",
                 ["src/data/useQuery.ts", "src/data/cache.ts", "src/data/client.ts"]),
        "build": ("jonas-w", "Vite config, bundling, linting and CI", ["vite.config.ts", "eslint.config.js", "package.json"]),
        "a11y": ("mira-k", "Keyboard navigation, focus management and screen readers",
                 ["src/a11y/focus.ts", "src/a11y/announce.ts"]),
        "docs": ("priya-s", "Storybook, README and guides", ["docs/theming.md", "docs/getting-started.md"]),
    },
}
REPOS = {
    "api": dict(gid=90_000_001, desc="Orbit API: REST endpoints, auth, database and webhooks", private=False, enabled=True,
                issues=205, prs=70, first=412, ci=36, open_review=13,
                modes={"inbound_gate": "auto", "issue_triage": "auto", "pr_checks": "shadow", "routing": "auto",
                       "priority": "shadow", "spam": "shadow", "ci_gate": "auto"},
                promoted={"issue_triage": 24, "routing": 20, "inbound_gate": 16, "ci_gate": 22},
                thresholds={"issue.type": 0.8, "route.area": 0.8}),
    "web": dict(gid=90_000_002, desc="Orbit Console: the React admin dashboard", private=False, enabled=True,
                issues=140, prs=50, first=267, ci=12, open_review=6,
                modes={"inbound_gate": "auto", "issue_triage": "shadow", "pr_checks": "auto", "routing": "shadow",
                       "priority": "shadow", "spam": "off", "ci_gate": "auto"},
                promoted={"pr_checks": 12, "ci_gate": 9, "inbound_gate": 10}, thresholds={}),
    "infra": dict(gid=90_000_003, desc="Terraform modules and Helm charts for deploying Orbit", private=True, enabled=False),
}
RULES = ("# Contributing\n\n- Use conventional commit titles (`fix(auth): ...`).\n- Every behavior change needs a test.\n"
         "- Update the docs when you change public behavior.\n- Keep pull requests focused; one concern per PR.\n"
         "- Mark breaking changes with `!` and describe the migration.\n")

# ---- text pools: explicit (title, area) pairs plus format-generated ones --------------------------------------------
EP = {"POST /v1/orders": "database", "GET /v1/orders/{id}": "database", "PATCH /v1/customers/{id}": "database",
      "GET /v1/invoices": "http", "POST /v1/webhooks": "webhooks", "GET /v1/search": "database", "POST /v1/exports": "http",
      "POST /v1/uploads": "http", "POST /v1/auth/token": "auth", "DELETE /v1/orders/{id}": "database",
      "GET /v1/customers": "http", "PUT /v1/invoices/{id}": "database"}
COMP = {"Data table": "components", "Date picker": "components", "Select dropdown": "components", "Modal": "a11y",
        "Sidebar": "components", "Toast": "components", "Chart": "components", "File uploader": "data", "Tabs": "a11y"}
TEXT = {
    "api": dict(
        bug=[("Connection pool is exhausted after a few hours under load", "database"),
             ("Webhook deliveries are retried forever after a 410 response", "webhooks"),
             ("`orbit migrate` hangs when the database is unreachable", "database"),
             ("Rate limiter uses the proxy IP instead of X-Forwarded-For", "http"),
             ("Refresh tokens are still accepted after the user is deleted", "auth"),
             ("Pagination cursor breaks when sorting by created_at descending", "http"),
             ("OpenAPI schema marks `customer_id` optional but the server requires it", "docs"),
             ("Webhook signature verification fails for payloads with non-ASCII characters", "webhooks"),
             ("Migration 0042 fails on Postgres 14: column already exists", "database"),
             ("Memory grows steadily while exporting large datasets", "http"),
             ("Timestamps are returned without a timezone for archived orders", "http"),
             ("Server logs the full Authorization header at DEBUG level", "auth"),
             ("OAuth refresh races when two requests refresh the same token", "auth"),
             ("Webhook retries ignore the configured max attempts", "webhooks")],
        bug_gen=[(f"`{ep}` returns {st} when {cond}", area) for ep, area in EP.items()
                 for st in ("a 500", "a 502", "a 404", "a 409", "a 422 with an empty error body", "an empty 200",
                            "a 429 even though the limit isn't hit")
                 for cond in ("the payload contains a null customer_id", "the request has a trailing slash",
                              "page_size is above 100", "the order has more than 50 line items",
                              "the client retries with the same Idempotency-Key", "the body is gzip-compressed",
                              "the customer name contains an emoji", "the token expires mid-request",
                              "two requests arrive in the same millisecond", "the connection was just recycled",
                              "the filter uses a non-UTC date", "the Accept-Language header is missing")],
        feature=[("Support cursor-based pagination on /v1/search", "http"), ("Add `include=customer` expansion to GET /v1/orders", "http"),
                 ("Allow API keys scoped to a single resource type", "auth"), ("Webhook delivery logs should be filterable by status", "webhooks"),
                 ("Bulk create for POST /v1/customers", "http"), ("OpenTelemetry tracing for outgoing webhooks", "webhooks"),
                 ("Expose Prometheus metrics for the connection pool", "database"), ("Per-endpoint retry backoff for webhooks", "webhooks"),
                 ("ETag / If-None-Match support on GET /v1/invoices", "http"), ("Add a --dry-run flag to `orbit migrate`", "database"),
                 ("Let admins rotate webhook signing secrets without downtime", "webhooks"), ("CSV export for invoices", "http"),
                 ("Support Postgres read replicas", "database"), ("Idempotency-Key support on PATCH requests", "http")],
        feature_gen=[(f"Add {x} to {y}", a) for x, y, a in (("request IDs", "every error response", "http"), ("a `Retry-After` header", "429 responses", "http"),
                                                            ("an audit log", "API key changes", "auth"), ("a health endpoint", "the webhook worker", "webhooks"),
                                                            ("connection pool stats", "the /metrics endpoint", "database"), ("examples", "the OpenAPI spec", "docs"),
                                                            ("PKCE support", "the OAuth flow", "auth"), ("soft deletes", "customers", "database"),
                                                            ("field masks", "GET /v1/orders", "http"), ("a replay button", "failed webhook deliveries", "webhooks"))],
        question=[(f"How do I {t}?", a) for t, a in (("rotate an API key without downtime", "auth"), ("paginate through more than 10k orders", "http"),
                                                     ("verify webhook signatures in Node", "webhooks"), ("run the server behind a reverse proxy with a path prefix", "http"),
                                                     ("set a custom user-agent for outgoing webhooks", "webhooks"), ("filter orders by multiple statuses", "http"),
                                                     ("test webhooks locally", "webhooks"), ("upgrade from v1 to v2 without downtime", "database"),
                                                     ("configure the connection pool size", "database"), ("enable request logging in production", "http"),
                                                     ("write a custom auth backend", "auth"), ("export all customers as JSON", "http"),
                                                     ("use API keys with the OpenAPI client generator", "auth"), ("run migrations in CI", "database"),
                                                     ("add a custom header to every response", "http"), ("limit a key to read-only access", "auth"),
                                                     ("handle idempotency keys on retries", "http"), ("back up the database before upgrading", "database"))],
        docs=[(f"Docs: {t} {p}", "docs") for t in ("the pagination guide", "the webhook retry section", "the authentication page", "the OpenAPI examples",
                                                    "the deployment guide", "the rate limiting reference", "the CLI reference", "the migration guide")
              for p in ("is out of date", "has a broken link", "is missing a code example", "contradicts the actual behavior", "uses a deprecated parameter")],
        snippet=["curl -X POST http://localhost:8000/v1/orders -H 'Authorization: Bearer $TOKEN' -d '{\"customer_id\": null}'",
                 "curl 'http://localhost:8000/v1/search?q=widget&page_size=500' -H 'Authorization: Bearer $TOKEN'",
                 "orbit migrate --database postgresql://localhost/orbit"],
        env=["orbit 2.14.1, Python 3.12.4, PostgreSQL 15.6", "orbit 2.13.0, Python 3.11.9, PostgreSQL 14.12",
             "orbit 2.14.0 (docker image), PostgreSQL 16.2", "orbit 2.12.3, Python 3.12.1, macOS 14"],
        log=['Traceback (most recent call last):\n  File "src/orbit/http/app.py", line 118, in dispatch\n    response = await handler(request)\n'
             '  File "src/orbit/db/pool.py", line 76, in acquire\n    raise PoolTimeout("timed out waiting for a connection")\n'
             'orbit.db.pool.PoolTimeout: timed out waiting for a connection',
             'ERROR orbit.webhooks.delivery: delivery 8f2c failed: HTTPStatusError 410 Gone\nERROR orbit.webhooks.delivery: retry 7/unlimited scheduled in 3600s',
             'orbit.auth.tokens.InvalidToken: signature verification failed (kid=2024-03)\n  at src/orbit/auth/tokens.py:142'],
        why=["Our integration currently polls every minute to work around this.", "It would remove a custom proxy we maintain today.",
             "Other APIs we use support this out of the box."],
        pr_tests="tests/test_{a}.py"),
    "web": dict(
        bug=[("Table loses scroll position after sorting", "components"), ("Date picker shows the wrong month in Safari", "components"),
             ("Modal traps focus but can't be closed with Escape", "a11y"), ("Dark mode flashes white on first paint", "build"),
             ("Memory leak when navigating between Orders and Customers", "data"), ("Toast notifications overlap on small screens", "components"),
             ("Form validation errors aren't announced by screen readers", "a11y"), ("Infinite scroll fires duplicate requests", "data"),
             ("CSV download button does nothing in Firefox", "data"), ("Charts render blank when the dataset is empty", "components"),
             ("Hydration mismatch warning on the Settings page", "build"), ("Search input loses focus after each keystroke", "a11y"),
             ("Vite build fails with 'Cannot find module' after upgrading to 3.1", "build"), ("Bundle size doubled in 3.2 because of an accidental lodash import", "build"),
             ("ESLint plugin crashes on TypeScript 5.5", "build"), ("Stale data shown after a mutation until the page is refreshed", "data")],
        bug_gen=[(f"{c} {s} {w}", a) for c, a in COMP.items()
                 for s in ("doesn't update", "renders twice", "throws an error", "is unreadable", "ignores keyboard input", "flickers")
                 for w in ("after switching tabs", "in Safari 17", "on mobile", "with 1000+ rows", "when the locale is de-DE", "in dark mode")],
        feature=[("Column resizing in DataTable", "components"), ("Keyboard shortcuts for common actions", "a11y"),
                 ("Export the current table view as CSV", "data"), ("Persist filters in the URL", "data"), ("A compact density mode", "components"),
                 ("Virtualize long lists", "components"), ("RTL layout support", "components"), ("Custom theme tokens", "components"),
                 ("Skeleton loaders for charts", "components"), ("Prefetch data on link hover", "data")],
        feature_gen=[(f"Add {x} to {y}", a) for x, y, a in (("a loading state", "the Select dropdown", "components"), ("an optimistic update", "order edits", "data"),
                                                            ("focus restoration", "the Modal", "a11y"), ("source maps", "the production build", "build"),
                                                            ("a dark theme", "the chart palette", "components"), ("live regions", "toast messages", "a11y"),
                                                            ("request deduplication", "useQuery", "data"), ("a Storybook story", "every component", "docs"))],
        question=[(f"How do I {t}?", a) for t, a in (("customize the theme colors", "components"), ("disable the cache for one query", "data"),
                                                     ("add a custom column renderer", "components"), ("use the console with a self-signed API", "data"),
                                                     ("run the console behind a sub-path", "build"), ("test a component that uses useQuery", "data"),
                                                     ("add keyboard shortcuts to a table", "a11y"), ("switch the locale at runtime", "components"),
                                                     ("lazy-load the charts bundle", "build"), ("pass auth headers from a custom proxy", "data"))],
        docs=[(f"Docs: {t} {p}", "docs") for t in ("the theming guide", "the getting-started page", "the DataTable story", "the data fetching guide", "the a11y checklist")
              for p in ("is out of date", "has a broken link", "is missing a code example", "uses a deprecated prop")],
        snippet=["```tsx\n<DataTable rows={rows} sortable />\n```", "```tsx\nconst { data } = useQuery('/v1/orders', { staleTime: 0 })\n```",
                 "npm run build && npm run preview"],
        env=["orbit-console 3.2.0, Chrome 126, React 18.3", "orbit-console 3.1.2, Safari 17.5, macOS 14", "orbit-console 3.2.0, Firefox 127",
             "orbit-console 3.0.4, Node 20.14, Vite 5.3"],
        log=["Warning: Text content did not match. Server: \"3\" Client: \"4\"\n    at SettingsPage (src/pages/Settings.tsx:41)",
             "Uncaught TypeError: Cannot read properties of undefined (reading 'length')\n    at DataTable (src/components/DataTable.tsx:88:23)",
             "error during build:\nError: Cannot find module '@orbit/tokens' imported from vite.config.ts"],
        why=["Our support team asks for this every week.", "Right now we fork the component to get this.", "It would make the keyboard flow much smoother."],
        pr_tests="src/{a}/{a}.test.tsx"),
}
PRS = {
    "api": {
        "auth": [("fix", "refuse expired refresh tokens"), ("feat", "add scoped API keys"), ("fix", "constant-time comparison for key hashes"),
                 ("refactor", "split token validation from claims parsing"), ("feat", "support PKCE in the OAuth flow"), ("test", "cover key rotation"),
                 ("fix", "reject JWTs with an unknown kid"), ("chore", "bump pyjwt to 2.9"), ("fix", "stop logging the Authorization header")],
        "database": [("fix", "recycle connections after a failover"), ("feat", "expose pool statistics"), ("fix", "handle serialization failures with a retry"),
                     ("chore", "bump psycopg to 3.2"), ("feat", "add a read-replica option"), ("fix", "make migration 0042 idempotent"),
                     ("perf", "batch order line item inserts"), ("test", "add pool exhaustion regression test"), ("refactor", "extract the query builder")],
        "http": [("fix", "use X-Forwarded-For for rate limiting"), ("feat", "add request IDs to error responses"), ("fix", "keep cursors stable when sorting descending"),
                 ("perf", "stream large exports"), ("feat", "support ETag on invoices"), ("fix", "return Retry-After on 429"), ("refactor", "simplify the middleware stack"),
                 ("feat", "gzip request bodies"), ("test", "cover pagination edge cases"), ("fix", "serialize archived order timestamps with a timezone")],
        "webhooks": [("fix", "stop retrying after a 410"), ("feat", "per-endpoint backoff settings"), ("fix", "sign non-ASCII payloads as UTF-8"),
                     ("feat", "add a replay endpoint for failed deliveries"), ("chore", "bump httpx to 0.27"), ("test", "cover signature verification"),
                     ("fix", "respect max attempts when rescheduling")],
        "docs": [("docs", "clarify cursor pagination"), ("docs", "add webhook signing examples"), ("docs", "document rate limit headers"),
                 ("docs", "fix broken links in the deployment guide"), ("docs", "describe the v1 to v2 migration"), ("docs", "add curl examples to the OpenAPI spec")],
    },
    "web": {
        "components": [("fix", "keep scroll position when sorting DataTable"), ("feat", "column resizing"), ("fix", "Safari date parsing in DatePicker"),
                       ("feat", "compact density mode"), ("fix", "prevent toast overlap on mobile"), ("refactor", "extract Popover from Select"),
                       ("feat", "virtualize long tables"), ("test", "add DataTable sorting tests"), ("fix", "render an empty state in charts")],
        "data": [("fix", "dedupe in-flight requests"), ("feat", "prefetch on link hover"), ("fix", "invalidate cache after mutations"),
                 ("perf", "memoize query selectors"), ("fix", "stop duplicate infinite scroll fetches"), ("test", "cover cache eviction"), ("feat", "optimistic order edits")],
        "build": [("chore", "bump vite to 5.3"), ("fix", "inline the dark mode script to avoid a flash"), ("chore", "upgrade eslint to 9"),
                  ("perf", "drop lodash from the bundle"), ("fix", "resolve @orbit/tokens in vite.config.ts"), ("ci", "cache node_modules in CI")],
        "a11y": [("fix", "close Modal on Escape"), ("feat", "announce form errors to screen readers"), ("fix", "restore focus after closing dialogs"),
                 ("test", "add axe checks to Storybook"), ("feat", "keyboard shortcuts for tables")],
        "docs": [("docs", "document theme tokens"), ("docs", "refresh the getting-started guide"), ("docs", "add a data fetching recipe"), ("docs", "fix typos in the README")],
    },
}
INTRO = {
    "bug": ["We're seeing this in production since last week.", "This started after we upgraded.", "It breaks our nightly sync job.",
            "Hit this today in staging.", "Not sure if this is already known.", "This is blocking our release."],
    "feature": ["We'd love to see this.", "This would simplify our integration a lot.", "Related to a workaround we maintain today.",
                "Happy to help implement this if the direction is OK."],
    "question": ["I read the docs but couldn't find a clear answer.", "Sorry if this is the wrong place to ask.", "We're evaluating Orbit for our team."],
    "docs": ["Small thing I noticed while following the guide."],
}
VAGUE = ["It just fails sometimes, please fix.", "Not sure how to reproduce, it happens randomly.", "Please look into this ASAP."]
LOWQ = ["not working", "Error", "api broken??", "please help urgent", "doesn't work after update", "BUG", "crash", "broken"]
SPAM = [("Best SEO services for your repo - contact us today", "Boost your rankings!!! Visit seo-boost-now.example for 50% off. Limited time."),
        ("FREE crypto airdrop - claim now", "Congratulations! Claim your tokens at claim-free-tokens.example before they expire."),
        ("Buy followers cheap", "Cheap followers and stars for your GitHub, DM me on telegram."), ("asdfgh", "qwerty asdf zxcv")]
SPECIAL = {  # (title, body, extra latent) per repo; days-ago, special-kind
    "api": [
        (26, "sec", "Authentication bypass: JWT with alg=none is accepted", True,
         "While testing, I noticed that any endpoint accepts a token whose header is `{\"alg\":\"none\"}`.\n\n```\ncurl -H 'Authorization: Bearer eyJhbGciOiJub25lIn0.eyJzdWIiOiIxIn0.' http://localhost:8000/v1/customers\nHTTP/1.1 200 OK\n```\n"
         "This looks critical. Please advise on responsible disclosure."),
        (12, "sec", "SQL injection in /v1/search?q=", False,
         "My scanner flagged the `q` parameter as vulnerable to SQL injection. Please fix urgently. I can share the full report if there is a bounty."),
        (6, "sec", "Possible RCE through webhook payload templates", False,
         "Webhook templates seem to be rendered with a full Jinja environment. I believe arbitrary code can be executed. Haven't tried a proof of concept yet."),
        (1.5, "sec", "API keys are exposed in error responses (information disclosure)", True,
         "Sending a malformed request to `/v1/exports` returns the full Authorization header in the error body:\n```\n{\"error\": \"bad request\", \"debug\": {\"headers\": {\"authorization\": \"Bearer jt_live_...\"}}}\n```"),
        (9, "ungrounded", "Race condition in `src/orbit/core/scheduler.py` corrupts the job queue", False,
         "`Scheduler.tick()` in `src/orbit/core/scheduler.py` is not thread safe, which corrupts the job queue under load. Please add a lock."),
        (2, "ungrounded", "`orbit/cache/redis_backend.py` ignores TTL settings", False,
         "In `orbit/cache/redis_backend.py` the TTL is never passed to SETEX, so cached entries live forever."),
        (14, "nonissue", "Pagination returns a cursor instead of page numbers", False,
         "The docs say cursor pagination is by design, but I'd like `page=2` to work like every other API. This is a bug."),
        (3, "nonissue", "Webhooks are delivered twice sometimes", False,
         "I received the same event twice. Delivery is supposed to be exactly once, right?"),
    ],
    "web": [(4, "sec", "Stored XSS in the order notes field", True,
             "Order notes are rendered unescaped in the detail drawer. PoC: set a note to `<img src=x onerror=alert(document.domain)>` and open the order.")],
}
CI_TESTS = {
    "api": dict(flaky=["tests/integration/test_webhooks.py::test_retry_backoff", "tests/test_search.py::test_ranking_is_stable",
                       "tests/integration/test_db.py::test_pool_recovers_after_restart", "tests/test_exports.py::test_large_export_streams",
                       "tests/integration/test_oauth.py::test_refresh_race", "tests/test_http.py::test_rate_limit_window"],
                bug=[("tests/test_orders.py::test_refund_is_idempotent", "database"), ("tests/test_auth.py::test_token_expiry_edge", "auth"),
                     ("tests/test_http.py::test_gzip_request_body", "http"), ("tests/test_webhooks.py::test_signature_unicode", "webhooks"),
                     ("tests/test_orders.py::test_bulk_line_items", "database")]),
    "web": dict(flaky=["e2e/orders.spec.ts > sorting keeps scroll", "src/components/Toast.test.tsx > stacks messages",
                       "e2e/search.spec.ts > debounces input"],
                bug=[("src/data/cache.test.ts > evicts stale entries", "data"), ("e2e/modal.spec.ts > closes on Escape", "a11y")]),
}
INFRA_LOGS = ["ConnectionError: HTTPSConnectionPool(host='pypi.org', port=443): Max retries exceeded", "OSError: [Errno 28] No space left on device",
              "Error: The runner has received a shutdown signal", "npm ERR! network request to https://registry.npmjs.org failed, reason: ECONNRESET"]
FLAKY_LOGS = ["TimeoutError: waited 5.0s for event", "AssertionError: assert 2 == 3  # ordering differs between runs", "Failed: Timeout >10.0s"]
BUG_LOGS = ["AssertionError: assert 409 == 200", "KeyError: 'customer_id'", "TypeError: Cannot read properties of undefined (reading 'length')"]


HOLDS = (("gate.security_claim", "true", "possible security report"),
         ("gate.grounded", "false", "references files that don't exist in the repository"),
         ("gate.known_non_issue", "true", "describes documented or already rejected behavior"))
HOLD_IF = tuple((q, bad) for q, bad, _ in HOLDS)
EXTERNAL = ["gate.reproducible", "gate.grounded", "gate.known_non_issue", "gate.claim_supported", "gate.security_claim"]
PREFIX = {"bug": ["Bug: ", "[Bug] ", "Regression: "], "feature": ["Proposal: ", "[Feature] ", "Request: "],
          "question": ["[Question] ", "Help: ", "Question: "], "docs": ["Typo: ", "[Docs] ", "Docs issue: "]}
P_TRUTH = {"issue.type": 1, "priority": .45, "route.area": .6, "spam": 1, "pr.breaking": 1}  # of the items a maintainer labeled at all


def _lc(t: str) -> str:
    """Lowercase the first letter unless it starts an identifier or acronym ("CSV export", "OpenTelemetry")."""
    return t[0].lower() + t[1:] if t.split(" ", 1)[0][1:].islower() else t


def _sha(repo, title: str) -> str:
    return hashlib.sha1(f"{repo['key']}{title}".encode()).hexdigest()


def _options(base: str, cfg, repos: list[str]) -> list[str]:
    if base == "route.area":
        return list(cfg.areas) + ["none"]
    if base == "route.repo":
        return repos
    q = QUESTIONS[base]
    return ["true", "false"] if q.type == "noul" else [str(i) for i in range(len(q.criteria))] if q.type == "score" else list(q.criteria)


def _verdict(rng, base: str, truth: str, options: list[str], force: str | None = None):
    """Simulated calibrated model -> (answer, probabilities, confidence): mostly confident and right, some unsure, a few
    confident-wrong. force="hi" is confident and right, "lo" is unsure."""
    hi, u = HARD.get(base, .84), rng.random()
    band = force or ("hi" if u < hi else "mid" if u < hi + (1 - hi) * .65 else "lo")
    conf = {"hi": rng.uniform(.9, .995), "mid": rng.uniform(.6, .9), "lo": rng.uniform(max(.4, 1 / len(options) + .04), .6)}[band]
    right = force == "hi" or rng.random() < {"hi": .97, "mid": .72, "lo": .42}[band]
    answer = truth if right else rng.choice([o for o in options if o != truth])
    rest = [o for o in options if o != answer]
    w = [rng.random() ** 2 + .02 for _ in rest]
    p = {answer: conf, **{o: (1 - conf) * x / sum(w) for o, x in zip(rest, w)}}
    probs = {o: round(p[o], 4) for o in options}
    return answer, probs, probs[answer]


def _titles(rng, rk: str, typ: str, n: int) -> list[tuple[str, str]]:
    """n unique (title, area): every hand-written title first, then format-generated ones, then prefixed variants."""
    pool, gen = TEXT[rk][typ], TEXT[rk].get(f"{typ}_gen", [])
    picks = list(pool) if n >= len(pool) else rng.sample(pool, n)
    picks += rng.sample(gen, min(len(gen), n - len(picks)))
    while len(picks) < n:
        t, a = rng.choice(pool)
        picks.append((rng.choice(PREFIX[typ]) + _lc(t), a))
    out, seen = [], set()
    for t, a in picks:
        out.append((t if t not in seen else f"{t} ({len(seen)})", a))
        seen.add(out[-1][0])
    rng.shuffle(out)
    return out


def _issue_specs(rng, rk: str, n: int, sibling: str) -> list[dict]:
    """Latent truth + text for n ordinary issues: bugs, features, questions, docs, a few low-quality reports and some spam."""
    T = TEXT[rk]
    types = rng.choices(["bug", "feature", "question", "docs"], [.46, .26, .18, .10], k=n)
    pools = {t: _titles(rng, rk, t, types.count(t)) for t in set(types)}
    specs = []
    for typ in types:
        title, area = pools[typ].pop()
        bug, roll = typ == "bug", rng.random()
        L = {"spam": "false", "gate.known_non_issue": "false", "gate.security_claim": "false",
             "issue.has_repro": "true" if bug and rng.random() < .62 else "false",
             "issue.has_version": "true" if rng.random() < (.55 if bug else .25) else "false",
             "issue.has_logs": "true" if bug and rng.random() < .45 else "false",
             "priority": rng.choices(["p0", "p1", "p2", "p3"], [.03, .22, .5, .25] if bug else [0, .02, .3, .68])[0]}
        spec = dict(type=typ, area=area, title=title, latent=L)
        if roll < .03:
            spam_title, spam_body = rng.choice(SPAM)
            spec.update(type="question", area="none", title=spam_title, body=spam_body, author=rng.choice(STRANGERS))
            L.update(spam="true", priority="p3", **{"issue.has_repro": "false", "issue.has_version": "false", "issue.has_logs": "false"})
        elif roll < .07:
            spec.update(type="bug", area="none", title=rng.choice(LOWQ), body=rng.choice(["", "it doesnt work. fix pls", "same here"]), author=rng.choice(STRANGERS))
            L.update(priority="p2", **{"issue.has_repro": "false", "issue.has_version": "false", "issue.has_logs": "false"})
        else:
            parts = [rng.choice(INTRO[typ])]
            if bug:
                parts.append(f"Concretely: {_lc(title)}.")
                parts.append("**Steps to reproduce**\n1. Start the server with the default config\n2. Run:\n```\n" + rng.choice(T["snippet"]) + "\n```\n3. Observe the failure"
                             if L["issue.has_repro"] == "true" else rng.choice(VAGUE))
                if rng.random() < .12 and area != "none":
                    fake = rng.random() < .3
                    path = rng.choice(_AREA[rk][area][2])
                    path = path.replace(".py", "_v2.py").replace(".ts", "_legacy.ts") if fake else path
                    spec["refs"] = [(path, not fake)]
                    parts.append(f"I think the problem is in `{path}`.")
                spec["dup"] = rng.random() < .07
            elif typ == "feature":
                parts += [f"**Proposal**\n{title}.", f"**Why**\n{rng.choice(T['why'])}"]
            elif typ == "question":
                parts += [title, "What I tried:\n- the guide in the docs\n- searching existing issues"]
            else:
                parts.append(f"{title[6:]}: the page says one thing, the behavior is another.")
            if L["issue.has_version"] == "true":
                parts.append("**Environment**\n- " + rng.choice(T["env"]))
            if L["issue.has_logs"] == "true":
                parts.append("**Logs**\n```\n" + rng.choice(T["log"]) + "\n```")
            spec["body"] = "\n\n".join(parts)
            if typ != "question" and rng.random() < .06:  # filed in the wrong repo
                spec.update(repo=sibling, area="none")
        L["gate.reproducible"] = L["issue.has_repro"]
        L["gate.claim_supported"] = "true" if "true" in (L["issue.has_repro"], L["issue.has_logs"]) else "false"
        specs.append(spec)
    return specs


def _special_spec(rk: str, kind: str, title: str, supported: bool, body: str) -> dict:
    """A security claim, a report about files that don't exist, or a documented non-issue: all from outside the core team."""
    ok = "true" if supported else "false"
    L = {"spam": "false", "priority": "p1" if kind == "sec" else "p2", "issue.has_repro": ok, "issue.has_version": "false", "issue.has_logs": "false",
         "gate.reproducible": ok, "gate.claim_supported": ok, "gate.known_non_issue": "true" if kind == "nonissue" else "false",
         "gate.security_claim": "true" if kind == "sec" else "false"}
    return dict(type="bug" if kind != "nonissue" else "question", area=list(_AREA[rk])[0 if kind == "sec" else 2], title=title, body=body, latent=L,
                refs=[(m, False) for m in re.findall(r"`([\w/]+\.py)`", body)] if kind == "ungrounded" else None, sure=("gate.security_claim", "gate.known_non_issue", "gate.grounded"),
                author=STRANGERS[sum(map(ord, title)) % len(STRANGERS)])


def _config(spec):
    areas = {n: {"owner": o, "paths": sorted({os.path.dirname(f) + "/**" for f in files}), "description": d} for n, (o, d, files) in spec["areas"].items()}
    text = render_yaml({"comments": spec["comments"], "features": {f: {"mode": m} for f, m in spec["modes"].items()},
                        "thresholds": spec["thresholds"], "areas": areas, "evaluation": {"min_samples": 20}})
    return parse_config(text)


class _Seed:
    def __init__(self, c, rng, now, install):
        self.c, self.rng, self.now, self.install = c, rng, now, install
        self.repos, self.queue, self.items, self.audit, self.flaky, self.backfilled = [], [], [], [], {}, 0

    def ago(self, days: float) -> datetime:
        return self.now - timedelta(days=days)

    def ins(self, table: str, **cols) -> int:
        vals = [Jsonb(v) if isinstance(v, (dict, list)) else v for v in cols.values()]
        return self.c.execute(f"INSERT INTO {table} ({', '.join(cols)}) VALUES ({', '.join(['%s'] * len(cols))}) RETURNING id", vals).fetchone()["id"]

    def log(self, repo, actor, action, target, details, at) -> None:
        self.audit.append((repo["org_id"], repo["id"], actor, action, target, Jsonb(details), at))

    def mode(self, repo, feature: str, t) -> str:
        """Configured mode, except an `auto` feature ran in shadow until its promotion date."""
        m = repo["cfg"].mode(feature)
        return "shadow" if m == "auto" and t < self.ago(repo["promoted"][feature]) else m

    # ---- items ---------------------------------------------------------------------------------------------------
    def make_item(self, repo, kind, title, body, author, t, state, live=True, extra=None, source=None) -> dict:
        n = None
        if kind in ("issue", "pr"):
            repo["n"] += 1
            n = repo["n"]
        assoc = None if author is None else "OWNER" if author == "mira-k" else "MEMBER" if author in TEAM else "CONTRIBUTOR" if author in CONTRIBUTORS else "NONE"
        url = n and f"https://github.com/{repo['full']}/{'pull' if kind == 'pr' else 'issues'}/{n}"
        item = dict(kind=kind, number=n, t=t, repo=repo, assoc=assoc, title=title, decisions={})
        item["id"] = self.ins("items", repo_id=repo["id"], kind=kind, github_number=n, title=title, body=body, author=author, author_association=assoc,
                              html_url=url, state=state, source=source or ("webhook" if live else "backfill"), extra=extra or {}, created_at=t, updated_at=t)
        self.items.append(item)
        return item

    def state_text(self, repo, item, body, refs=None, files=()) -> str:
        s = f"## Title\n{item['title']}\n\n## Body\n{body[:6000]}"
        if refs:
            s += ("\n\n## Repository facts\nReferenced paths found: " + (", ".join(r for r, ok in refs if ok) or "none")
                  + "; not found: " + (", ".join(r for r, ok in refs if not ok) or "none"))
        if files:
            s += "\n\n## Changed files\n" + "\n".join(f"- {f} (+{self.rng.randint(2, 90)}/-{self.rng.randint(0, 40)})" for f in files) + f"\n\n## Contributing rules\n{RULES}"
        if repo["cfg"].areas:
            s += "\n\n## Areas\n" + "\n".join(f"- {n}: {a.description}" for n, a in repo["cfg"].areas.items())
        if item["kind"] == "issue":
            s += "\n\n## Repositories\n" + "\n".join(f"- {r['full']}: {r['desc']}" for r in self.repos if r["enabled"])
        return s

    def issue(self, repo, t, live, spec) -> None:
        rng, cfg = self.rng, repo["cfg"]
        typ, area, title, body = spec["type"], spec["area"], spec["title"], spec.get("body", "")
        L, dup = dict(spec["latent"]), None
        if spec.get("dup") and live:
            pool = [c for c in repo["issues"] if c["type"] == "bug" and c["area"] != "none"][-40:]
            if pool:
                dup = rng.choice(pool)
                area, title = dup["area"], rng.choice(["", "[Bug] ", "Still happening: "]) + dup["title"]
                body = f"{rng.choice(INTRO['bug'])}\n\nConcretely: {_lc(title)}.\n\n{rng.choice(VAGUE)}"
                L.update({"issue.has_repro": "false", "issue.has_version": "false", "issue.has_logs": "false", "gate.reproducible": "false", "gate.claim_supported": "false"})
        author = spec.get("author") or rng.choices(TEAM + CONTRIBUTORS + STRANGERS, [5] * 4 + [2] * len(CONTRIBUTORS) + [2] * len(STRANGERS))[0]
        L.update({"issue.type": typ, "route.area": area, "route.repo": spec.get("repo") or repo["full"]})
        state = "closed" if not live or (self.now - t).days > 10 and rng.random() < .62 else "open"
        item = self.make_item(repo, "issue", title, body, author, t, state, live)
        qs = ["issue.type", "issue.has_repro", "issue.has_version", "issue.has_logs", "priority"] + (["spam"] if cfg.mode("spam") != "off" else [])
        qs += ["route.area", "route.repo"]
        force, refs = dict.fromkeys(spec.get("sure", ()), "hi"), None
        if cfg.mode("inbound_gate") != "off" and item["assoc"] not in cfg.core_team:
            qs += ["gate.reproducible", "gate.known_non_issue", "gate.claim_supported", "gate.security_claim"]
            if refs := spec.get("refs"):
                qs.append("gate.grounded")
                L["gate.grounded"] = "true" if all(ok for _, ok in refs) else "false"
            near = [c for c in repo["issues"] if c["area"] == area and c["type"] == typ and c is not dup][-6:]
            for c in ([dup] if dup else []) + (rng.sample(near, min(len(near), rng.randint(1, 2))) if live and near and rng.random() < .55 else []):
                qs.append(q := f"gate.same_as#{c['number']}")
                L[q] = "true" if c is dup else "false"
                force[q] = "hi" if c is dup else None
        error = "jev: request timed out after 30s" if live and rng.random() < .008 else None
        V = self.triage(repo, item, t, self.state_text(repo, item, body, refs), qs, L, force, live, error)
        repo["issues"].append(dict(id=item["id"], number=item["number"], title=title, area=area, type=typ))
        if not live:
            self.backfill_truth(item, V, ("issue.type", "priority", "route.area", "spam"))

    def pr(self, repo, t, live, area, prefix, phrase) -> None:
        rng, rk = self.rng, repo["key"]
        core = rng.random() < .4
        breaking = rng.random() < (.16 if prefix == "feat" else .03)
        level = rng.choices(["0", "1", "2"], [.03, .17, .8] if core else [.12, .28, .6])[0]
        title = f"{prefix}({area}){'!' if breaking else ''}: {phrase}"
        files = rng.sample(_AREA[rk][area][2], k=min(len(_AREA[rk][area][2]), rng.randint(1, 3)))
        if level == "2" and prefix not in ("docs", "chore", "ci"):
            files.append(TEXT[rk]["pr_tests"].format(a=area))
        fixes = rng.choice(repo["issues"])["number"] if repo["issues"] and level != "0" else None
        what = f"## What\n{phrase[0].upper() + phrase[1:]}.\n\n## Why\n" + (f"Fixes #{fixes}." if fixes else "Part of the cleanup we discussed in the last sync.")
        body = {"0": rng.choice(["fix", "<!-- describe your change -->", "see title", "small change"]), "1": what,
                "2": what + "\n\n## Testing\n- Added tests for the new behavior\n- `make test` passes locally\n\n## Docs\nUpdated where needed."}[level]
        if breaking:
            body += "\n\n**BREAKING CHANGE:** callers must update their configuration; see the migration notes."
        age = (self.now - t).days
        state = "merged" if not live or age > 4 and rng.random() < .75 else "closed" if age > 12 and rng.random() < .5 else "open"
        item = self.make_item(repo, "pr", title, body, rng.choice(TEAM if core else CONTRIBUTORS), t, state, live,
                              extra={"head_sha": _sha(repo, title)})
        L = {"pr.breaking": "true" if breaking else "false", "pr.follows_rules": level, "route.area": area, "spam": "false"}
        qs = ["pr.breaking", "pr.follows_rules", "route.area"] + (["spam"] if repo["cfg"].mode("spam") != "off" else [])
        V = self.triage(repo, item, t, self.state_text(repo, item, body, files=files), qs, L, {}, live)
        if not live:
            self.backfill_truth(item, V, ("pr.breaking", "route.area"))

    # ---- a decision run: simulated verdicts -> outcomes -> rows ----------------------------------------------------
    def verdicts(self, repo, qs, latent, force) -> dict:
        repos = [r["full"] for r in self.repos if r["enabled"]]
        V = {}
        for qid in qs:
            base = base_id(qid)
            truth = latent[qid] if qid in latent else latent[base]
            ans, probs, conf = _verdict(self.rng, base, truth, _options(base, repo["cfg"], repos), force.get(qid) or force.get(base))
            V[qid] = dict(qid=qid, base=base, feature=QUESTIONS[base].feature, answer=ans, probs=probs, conf=conf, truth=truth, outcome="shadow",
                          thr=repo["cfg"].thresholds.get(base) or QUESTIONS[base].default_threshold)
        return V

    def triage(self, repo, item, t, state, qs, latent, force, live, error=None) -> dict:
        trigger = "webhook" if live else "backfill"
        if live:
            t_run = t + timedelta(seconds=self.rng.randint(4, 25))
        else:  # the backfill walked the old items one after another, right after install
            self.backfilled += 1
            t_run = self.install + timedelta(minutes=3, seconds=7 * self.backfilled)
        if error:
            self.run_row(item, t_run, trigger, state, error=error)
            self.enqueue(repo, item, t_run, "pipeline", f"decision backend error: {error}")
            return {}
        V = self.verdicts(repo, qs, latent, force)
        acts, queue = self.rules(repo, item, t_run, V, live)
        self.write(repo, item, t_run, trigger, state, V, acts, queue)
        return V

    def rules(self, repo, item, t, V, live):
        """The pipeline's outcome rules (CONTRIBUTING: decide/settle/suggest) -> (actions, queue entries)."""
        cfg, acts, queue, held = repo["cfg"], [], [], False
        L = cfg.label
        above = lambda q, a: V[q]["answer"] == a and V[q]["conf"] >= V[q]["thr"]  # noqa: E731

        def settle(q, actionable=True, act=None, suggest=None):
            v, m = V[q], self.mode(repo, V[q]["feature"], t)
            if not live or m == "off":
                o = "shadow"
            elif held and v["feature"] != "inbound_gate":
                o = "skipped"
            elif m == "shadow":
                o = "shadow"
                queue.append((v["feature"], suggest or "shadow: suggested answers", "review"))
            elif suggest:
                o = "queued"
                queue.append((v["feature"], suggest, "review"))
            elif not actionable:
                o = "skipped"
            elif v["conf"] >= v["thr"]:
                o = "acted"
                if act:
                    acts.append((q, *act))
            else:
                o = "queued"
                queue.append((v["feature"], f"{q}: {v['answer']} ({v['conf']:.0%}), below threshold ({v['thr']:.0%})", "review"))
            v["outcome"] = o

        for q in V:
            if q.startswith("gate.same_as#"):
                settle(q, False, suggest=f"possible duplicate of #{q.split('#')[1]}" if above(q, "true") else None)
        for q, bad, why in HOLDS:
            if q in V and above(q, bad) and not held and live and self.mode(repo, "inbound_gate", t) == "auto":
                settle(q)
                held = True
                weak = "gate.claim_supported" in V and above("gate.claim_supported", "false")
                acts.append((q, "label", L("held")))
                queue.append(("inbound_gate", why + (", no supporting evidence" if weak else ""), "held"))
            elif q in V:
                settle(q, False)
        if "gate.claim_supported" in V:
            settle("gate.claim_supported", False)
        if "gate.reproducible" in V:
            settle("gate.reproducible", V["gate.reproducible"]["answer"] == "false" and not held, ("label", L("needs_info")))
        if "issue.type" in V:
            settle("issue.type", True, ("label", L("issue.type", V["issue.type"]["answer"])))
        for q in V:
            if q.startswith("issue.has_"):
                settle(q, V[q]["answer"] == "false", ("label", L("needs_info")))
        if "pr.breaking" in V:
            b = V["pr.breaking"]
            settle("pr.breaking", b["answer"] == "true" or b["conf"] >= b["thr"], ("label", L("breaking")) if b["answer"] == "true" else None)
            if live and self.mode(repo, "pr_checks", t) == "auto":
                acts.append(("pr.breaking", "check_run"))
        if "pr.follows_rules" in V:
            f = V["pr.follows_rules"]
            settle("pr.follows_rules", f["answer"] != "2" or f["conf"] >= f["thr"])
        if "priority" in V:
            settle("priority", True, ("label", L("priority", V["priority"]["answer"])))
        if "spam" in V:
            settle("spam", V["spam"]["answer"] == "true", ("label", L("spam")))
        if "route.area" in V:
            a = cfg.areas.get(V["route.area"]["answer"])
            settle("route.area", a is not None, ("label", L("route.area", V["route.area"]["answer"]), a and a.owner))
        if "route.repo" in V:
            r = V["route.repo"]
            settle("route.repo", False, suggest=f"belongs in {r['answer']}" if r["answer"] != repo["full"] and r["conf"] >= r["thr"] else None)
        return acts, queue

    def run_row(self, item, t, trigger, state, error=None, tokens=0, latency=0) -> int:
        item["run_at"] = t
        return self.ins("decision_runs", item_id=item["id"], trigger=trigger, backend="jev", model_version="jev-1.13.0", calibrated=True,
                        state_hash=hashlib.sha256(state.encode()).hexdigest(), state_text=state, latency_ms=latency, tokens_in=tokens,
                        cost_usd=round(tokens * 0.042 / 1e6, 8), error=error, created_at=t)

    def write(self, repo, item, t, trigger, state, V, acts, queue) -> None:
        rng = self.rng
        run_id = self.run_row(item, t, trigger, state, tokens=len(state) // 3 + 380 + 60 * len(V), latency=int(rng.uniform(220, 640) + 12 * len(V)))
        for v in V.values():
            v["id"] = self.ins("decisions", run_id=run_id, item_id=item["id"], repo_id=repo["id"], question_id=v["qid"], base_question=v["base"],
                               answer=v["answer"], probabilities=v["probs"], confidence=v["conf"], threshold_at_time=v["thr"], outcome=v["outcome"], created_at=t)
        ref = item["number"] and f"{repo['full']}#{item['number']}"
        done = set()
        for q, kind, *a in acts:
            do = partial(self.action, repo, item, V[q], t)
            if kind == "label" and a[0] and a[0] not in done:
                done.add(a[0])
                do("label", ref, labels=[a[0]])
                if a[0] == repo["cfg"].label("needs_info") and repo["cfg"].comments:
                    do("comment", ref, key="needs-info:logs,repro,version", comment_id=None,
                       body="Thanks for the report! To help us look into this, please add steps to reproduce the problem, the affected version and any logs.")
                if len(a) > 1 and a[1]:
                    do("assign", ref, logins=[a[1]])
            elif kind == "check_run":
                sha = _sha(repo, item["title"])
                do("check_run", f"{repo['full']}@{sha[:7]}", head_sha=sha, check_run_id=None, title="Jev Triage")
            elif kind == "file_issue":
                self.action(repo, None, V[q], t, "file_issue", None, title=item["title"], labels=[repo["cfg"].label("ci")], number=None)
        item["decisions"] = V
        seen = set()
        for feature, reason, bucket in queue:
            if bucket not in seen:
                seen.add(bucket)
                self.enqueue(repo, item, t, feature, reason, bucket)

    def action(self, repo, item, v, t, kind, ref, **payload) -> None:
        self.ins("actions", item_id=item and item["id"], repo_id=repo["id"], decision_id=v["id"], kind=kind, github_ref=ref,
                 payload={**payload, "dry_run": True}, created_at=t)

    def enqueue(self, repo, item, t, feature, reason, bucket="review") -> None:
        qid = self.ins("queue_items", item_id=item["id"], repo_id=repo["id"], feature=feature, reason=reason, bucket=bucket, created_at=t)
        self.queue.append(dict(id=qid, repo=repo, item=item, bucket=bucket, t=t))

    def backfill_truth(self, item, V, qids) -> None:
        if item["kind"] == "issue" and self.rng.random() > .75:  # a quarter of the closed issues never got a label
            return
        for q in qids:
            if q in V and self.rng.random() < P_TRUTH[q] and V[q]["truth"] not in ("none", "false" if q == "spam" else None):
                self.c.execute("INSERT INTO ground_truth (item_id, question_id, answer, source, created_at) VALUES (%s, %s, %s, 'backfill', %s) "
                               "ON CONFLICT DO NOTHING", (item["id"], q, V[q]["truth"], item["run_at"]))

    # ---- CI gate -------------------------------------------------------------------------------------------------
    def ci_report(self, repo, t, scenario, external=None) -> None:
        rng, cfg, rk = self.rng, repo["cfg"], repo["key"]
        ci = external is None
        gate = "ci_gate" if ci else "inbound_gate"
        on = self.mode(repo, gate, t) == "auto"
        sha, run_url = secrets.token_hex(20), f"https://github.com/{repo['full']}/actions/runs/{rng.randint(9_100_000_000, 9_400_000_000)}"
        cands, target, force = [], None, {}
        if ci:
            cause = {"flaky": "flaky_test", "infra": "infrastructure"}.get(scenario, "code_bug")
            if cause == "code_bug":
                (test, area), log = rng.choice(CI_TESTS[rk]["bug"]), rng.choice(BUG_LOGS)
            else:
                test = rng.choice(CI_TESTS[rk]["flaky"] + ([x for x, _ in CI_TESTS[rk]["bug"]] if cause == "infrastructure" else []))
                area, log = rng.choice(list(cfg.areas)), rng.choice(FLAKY_LOGS if cause == "flaky_test" else INFRA_LOGS)
            title, body = f"CI failure: {test} on main", f"The `{test}` check failed on the latest push to main.\n\nRun: {run_url}"
            payload = dict(repo=repo["full"], title=title, body=body, failing_test=test, log_excerpt=log, commit_sha=sha, run_url=run_url, source="ci")
            latent = {"ci.kind": cause, "priority": rng.choice(["p1", "p2", "p2", "p3"]), "route.area": area}
            qs, force["ci.kind"] = ["ci.kind", "priority", "route.area"], "lo" if scenario == "queued" else "hi"
            pool = [c for c in repo["issues"] if c["type"] == "bug" and c["area"] == area][-8:]
            if pool:
                cands = rng.sample(pool, min(len(pool), 1 if scenario in ("flaky", "queued", "infra") else rng.randint(1, 3)))
                target = cands[0] if scenario == "merged" else None
            elif scenario == "merged":
                scenario = "filed"
            for c in cands:
                qs.append(q := f"ci.same_as#{c['id']}")
                latent[q], force[q] = ("true", "hi") if c is target else ("false", None)
            state = f"## Title\n{title}\n\n## Body\n{body}\n\n## Failing test\n{test}\n\n## Log excerpt\n{log}"
            item = self.make_item(repo, "ci_report", title, body, None, t, "open", source="ci_agent", extra=dict(failing_test=test, commit_sha=sha, run_url=run_url))
        else:
            title, body = external
            held = scenario == "held"
            payload = dict(repo=repo["full"], title=title, body=body, source="external")
            latent = {"gate.reproducible": "false", "gate.grounded": "false" if held else "true", "gate.known_non_issue": "false",
                      "gate.claim_supported": "false", "gate.security_claim": "true" if held else "false"}
            qs, force = EXTERNAL, ({"gate.security_claim": "hi", "gate.grounded": "hi"} if held else {"gate.reproducible": "lo"})
            state = f"## Title\n{title}\n\n## Body\n{body}"
            item = self.make_item(repo, "report", title, body, None, t, "open", source="external")
        V = self.verdicts(repo, qs, latent, force)
        key = V["ci.kind"] if ci else V["gate.reproducible"]
        below = f"{key['qid']}: {key['answer']} ({key['conf']:.0%}), below threshold ({key['thr']:.0%})"
        used, filed, merged = set(), None, None
        if not on:
            would = "filed" if ci and scenario in ("queued", "rate_limited") else scenario
            outcome, reason = "queued", f"shadow: would be {would}"
        elif not ci:
            outcome, reason = ("held", "possible security report") if scenario == "held" else ("queued", below)
        elif scenario == "queued":
            outcome, reason = "queued", below
        elif scenario == "rate_limited":
            outcome, reason = "rate_limited", f"issue limit reached ({cfg.ci_gate.max_issues_per_hour}/hour)"
        else:
            outcome, reason, used = scenario, "", {"ci.kind"}
            if scenario == "merged":
                merged = target["number"]
                used.add(f"ci.same_as#{target['id']}")
            if scenario == "filed":
                issue = self.make_item(repo, "issue", f"[CI] {test} fails on main", "Filed automatically by the Jev Triage CI gate.", None, t, "open", source="ci_agent")
                filed = issue["number"]
                repo["issues"].append(dict(id=issue["id"], number=filed, title=issue["title"], area=area, type="bug"))
        acted = outcome in ("filed", "merged", "flaky", "infra")
        for q, v in V.items():
            v["outcome"] = ("acted" if q in used else "skipped") if acted else "queued" if on else "shadow"
        queue = [] if acted else [(gate, reason, "held" if outcome == "held" else "review")]
        self.write(repo, item, t + timedelta(seconds=rng.randint(2, 9)), "ci_gate", state, V, [("ci.kind", "file_issue")] if filed else [], queue)
        rid = self.ins("ci_reports", repo_id=repo["id"], item_id=item["id"], source="ci" if ci else "external", payload=payload, outcome=outcome,
                       filed_issue_number=filed, merged_into_number=merged, created_at=t)
        for c in cands:
            p = V[f"ci.same_as#{c['id']}"]["probs"]["true"]
            self.c.execute("INSERT INTO ci_candidates (report_id, candidate_item_id, retrieval_score, same_as_probability) VALUES (%s, %s, %s, %s)",
                           (rid, c["id"], round(rng.uniform(.3, .95) if c is target else rng.uniform(.12, .55), 3), p))
        if outcome == "flaky":
            f = self.flaky.setdefault((repo["id"], test), dict(n=0, first=t))
            f.update(n=f["n"] + 1, last=t, url=run_url)

    # ---- maintainers work the queue --------------------------------------------------------------------------------
    def resolve(self) -> None:
        rng = self.rng
        for repo in (r for r in self.repos if r["enabled"]):
            q = sorted((x for x in self.queue if x["repo"] is repo), key=lambda x: x["t"], reverse=True)
            review, held = [x for x in q if x["bucket"] == "review"], [x for x in q if x["bucket"] == "held"]
            n = repo["open_review"]
            older = review[n:n + 25]
            keep = review[:n] + rng.sample(older, min(3, len(older))) + held[:repo["open_held"]]
            for x in (x for x in q if x not in keep):
                who = rng.choice(TEAM)
                at = min(x["t"] + timedelta(hours=rng.uniform(2, 70)), self.now - timedelta(minutes=30))
                item = x["item"]
                if x["bucket"] == "held":  # a justified hold usually stays; a false alarm is released
                    real = any(item["decisions"][q]["truth"] == bad for q, bad in HOLD_IF if q in item["decisions"])
                    action = "dismiss" if real and rng.random() < .7 else "release"
                else:
                    action = "dismiss" if rng.random() < .45 else "accept"
                final = {}
                if action == "accept":
                    for d in item["decisions"].values():
                        if d["outcome"] in ("queued", "shadow"):
                            final[d["id"]] = d["truth"] if d["answer"] != d["truth"] and rng.random() < .9 else d["answer"]
                            self.truth(item, d, final[d["id"]], who, at)
                elif action == "release":
                    for qid, ans in (("gate.grounded", "true"), ("gate.known_non_issue", "false")):
                        self.upsert_truth(item, qid, ans, at)
                self.log(repo, who, f"queue.{action}", str(x["id"]), {"item_id": item["id"], "answers": {str(k): v for k, v in final.items()}}, at)
                self.c.execute("UPDATE queue_items SET status = %s, resolved_by = %s, resolved_at = %s WHERE id = %s",
                               ({"accept": "accepted", "dismiss": "dismissed", "release": "released"}[action], who, at, x["id"]))
        for item in self.items:  # a maintainer occasionally corrects a label the bot applied on its own
            for d in item["decisions"].values():
                if d["outcome"] == "acted" and d["answer"] != d["truth"] and rng.random() < .6:
                    who, at = rng.choice(TEAM), min(item["run_at"] + timedelta(hours=rng.uniform(3, 90)), self.now - timedelta(minutes=30))
                    self.truth(item, d, d["truth"], who, at)
                    self.log(item["repo"], who, "decision.override", str(d["id"]), {"question_id": d["base"], "from": d["answer"], "to": d["truth"]}, at)

    def upsert_truth(self, item, qid, answer, at) -> None:
        self.c.execute("INSERT INTO ground_truth (item_id, question_id, answer, source, created_at) VALUES (%s, %s, %s, 'override', %s) "
                       "ON CONFLICT (item_id, question_id) DO UPDATE SET answer = EXCLUDED.answer, source = 'override', created_at = EXCLUDED.created_at",
                       (item["id"], qid, answer, at))

    def truth(self, item, d, final, who, at) -> None:
        if final != d["answer"]:
            self.ins("overrides", decision_id=d["id"], github_user_id=1000 + TEAM.index(who), user_login=who, new_answer=final, created_at=at)
        self.upsert_truth(item, d["qid"], final, at)

    # ---- the whole story for one repo ------------------------------------------------------------------------------
    def history(self, repo, sibling) -> None:
        """Items arrive over ~60 days: those from before the install were backfilled, the rest went through live triage."""
        rng, rk = self.rng, repo["key"]
        spec = REPOS[rk]
        specs = _issue_specs(rng, rk, spec["issues"], sibling)
        base = [(a, p, ph) for a, items in PRS[rk].items() for p, ph in items]
        rng.shuffle(base)
        prs = [(a, p, ph + suffix) for suffix in ("", " (follow-up)", " (part 2)", " on the 2.x branch") for a, p, ph in base][:spec["prs"]]

        def when(n):  # n sorted timestamps over 60 days: quieter weekends, busier lately
            out = []
            while len(out) < n:
                t = self.ago(60 * rng.random() ** 1.15)
                t = t.replace(hour=rng.randint(6, 21), minute=rng.randint(0, 59), second=rng.randint(0, 59))
                if t < self.now - timedelta(minutes=10) and (t.weekday() < 5 or rng.random() < .35):
                    out.append(t)
            return sorted(out)

        events = [("issue", t, s) for t, s in zip(when(len(specs)), specs)] + [("pr", t, p) for t, p in zip(when(len(prs)), prs)]
        events += [("issue", self.ago(d), _special_spec(rk, k, title, ok, body)) for d, k, title, ok, body in SPECIAL.get(rk, [])]
        plan = ["flaky", "filed", "flaky", "merged", "infra", "flaky", "queued", "filed", "flaky", "merged", "rate_limited", "flaky", "infra", "merged"]
        cis = sorted(self.ago(rng.uniform(0.2, INSTALL_DAYS - 1)) for _ in range(spec["ci"]))
        live_ci = [t for t in cis if self.mode(repo, "ci_gate", t) == "auto"]  # cycle the plan so every outcome shows up once the gate acts
        events += [("ci", t, plan[live_ci.index(t) % len(plan)] if t in live_ci else rng.choice(["filed", "merged", "flaky", "infra", "flaky"])) for t in cis]
        ext = {"api": [(1.0, "held", "Remote code execution in the export endpoint", "I can run arbitrary commands via the `format` parameter of /v1/exports. Details privately."),
                       (8.0, "held", "Credentials leaked in docker image layers", "The published image contains a `.env` file with what look like production keys."),
                       (4.0, "queued", "Webhook payload docs are wrong", "The docs example for `order.paid` shows a field that doesn't exist.")],
               "web": [(6.0, "queued", "Console shows other tenants' names in the search box", "Might be a data leak, not sure. Saw it once.")]}[rk]
        events += [("ext", self.ago(d), (sc, title, body)) for d, sc, title, body in ext]
        for kind, t, p in sorted(events, key=lambda e: e[1]):
            live = t >= self.install
            if kind == "issue":
                self.issue(repo, t, live, p)
            elif kind == "pr":
                self.pr(repo, t, live, *p)
            elif kind == "ci":
                self.ci_report(repo, t, p)
            else:
                self.ci_report(repo, t, p[0], external=(p[1], p[2]))


def seed() -> dict:
    """Wipe and recreate demo-org. Returns row counts."""
    rng, now = random.Random(7), datetime.now(timezone.utc).replace(microsecond=0)
    db.execute("DELETE FROM orgs WHERE login = %s", (DEMO_ORG,))
    with db.transaction() as c:
        s = _Seed(c, rng, now, now - timedelta(days=INSTALL_DAYS))
        org = s.ins("orgs", github_installation_id=9_000_001, login=DEMO_ORG, avatar_url=f"https://github.com/identicons/{DEMO_ORG}.png", created_at=s.ago(60))
        for key, spec in REPOS.items():
            repo = dict(key=key, full=f"{DEMO_ORG}/{key}", desc=spec["desc"], enabled=spec["enabled"], org_id=org, issues=[], n=spec.get("first", 1),
                        promoted=spec.get("promoted", {}), open_review=spec.get("open_review", 0), open_held={"api": 5, "web": 1}.get(key, 0))
            if spec["enabled"]:
                repo["cfg"] = _config({**spec, "areas": _AREA[key], "comments": key == "api"})
                cols = dict(config=repo["cfg"].model_dump(), config_source="repo", config_sha="d3m0c0nf1g", rules_text=RULES, rules_sha="d3m0rul35",
                            backfill_status="done", created_at=s.install - timedelta(hours=2))
            else:
                repo["cfg"], cols = parse_config(None), dict(created_at=s.ago(3))
            repo["id"] = s.ins("repos", org_id=org, github_repo_id=spec["gid"], full_name=repo["full"], description=spec["desc"], private=spec["private"],
                               enabled=spec["enabled"], **cols)
            s.repos.append(repo)
        for repo in (r for r in s.repos if r["enabled"]):
            s.history(repo, f"{DEMO_ORG}/{'web' if repo['key'] == 'api' else 'api'}")
        s.resolve()
        for repo in (r for r in s.repos if r["enabled"]):
            n = sum(1 for i in s.items if i["repo"] is repo and i["kind"] in ("issue", "pr") and i["t"] < s.install)
            truth = c.execute("SELECT count(DISTINCT g.item_id) AS n FROM ground_truth g JOIN items i ON i.id = g.item_id "
                              "WHERE i.repo_id = %s AND g.source = 'backfill'", (repo["id"],)).fetchone()["n"]
            c.execute("UPDATE repos SET backfill_progress = %s WHERE id = %s", (Jsonb(dict(
                processed=n, total=n + 2, with_truth=truth, errors=2, started_at=(s.install + timedelta(minutes=2)).isoformat(),
                finished_at=(s.install + timedelta(minutes=3, seconds=7 * n)).isoformat())), repo["id"]))
            for name, revoked in (("github-actions", False), ("old-jenkins", True)):
                tid = s.ins("ci_tokens", repo_id=repo["id"], name=name, token_hash=hashlib.sha256(secrets.token_bytes(16)).hexdigest(), created_by="mira-k",
                            created_at=s.install + timedelta(days=1), revoked_at=s.ago(20) if revoked else None)
                s.log(repo, "mira-k", "ci_token.create", name, {"token_id": tid}, s.install + timedelta(days=1))
            for at, action, det in ((s.install - timedelta(hours=1), "repo.enable", {"acknowledge_private": False}),
                                    (s.install - timedelta(minutes=50), "labels.sync", {"created": ["jev: held", "jev: needs review", "ci-report"]}),
                                    (s.install, "backfill.queue", {})):
                s.log(repo, "mira-k", action, repo["full"], det, at)
        for (repo_id, test), f in s.flaky.items():
            c.execute("INSERT INTO flaky_tests (repo_id, test_id, occurrences, first_seen, last_seen, last_run_url) VALUES (%s, %s, %s, %s, %s, %s)",
                      (repo_id, test, f["n"] + rng.randint(0, 6), f["first"], f["last"], f["url"]))
        for row in sorted(s.audit, key=lambda r: r[-1]):
            c.execute("INSERT INTO audit_log (org_id, repo_id, actor, action, target, details, created_at) VALUES (%s, %s, %s, %s, %s, %s, %s)", row)
        return {t: c.execute(f"SELECT count(*) AS n FROM {t}").fetchone()["n"] for t in
                ("items", "decision_runs", "decisions", "ground_truth", "overrides", "queue_items", "actions", "ci_reports", "flaky_tests", "audit_log")}
