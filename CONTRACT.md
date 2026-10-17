# Jev Triage — Build Contract

Single source of truth for module boundaries. Each worker creates/edits ONLY the
files it owns (see **Ownership**). Need something from another module? Code
against the signature here; don't re-implement it. If a signature is
insufficient, add a private helper in your own file and say so in your report.

Style (ponytail): write only what's needed. No speculative abstractions, no
classes where a function works, stdlib before deps, no boilerplate. One small
test file per module covering the real branches.

## Binding product decisions (corrected spec)

1. **Feature modes** `off | shadow | auto`, default `shadow`. Shadow records
   decisions and queues the item with suggested answers; never acts. `auto` acts
   only on *eligible* decisions.
2. **Eligible** = `confidence >= threshold` AND feature mode `auto` AND
   (`evaluation.require_evaluation` false OR question measured:
   `metrics.question_stats(repo_id, qid).n >= evaluation.min_samples` and
   `accuracy >= threshold`).
3. **Confidence** = probability of the chosen answer. Choice: top option prob.
   Noul: answer `"true"` if p>=0.5 else `"false"`, confidence `max(p,1-p)`.
   Score: answer = argmax level as string, confidence = its prob.
4. **Silent by default**: comments only if repo config `comments: true` (all
   features, incl. CI "merged" notes). Never close/delete/lock/transfer.
   Transfers and duplicate links are suggestions (queued), except CI `ci.same_as`.
5. **Config truth = YAML** `.github/jev-triage.yml` in the repo; org defaults in
   `<org>/.github` repo same path. Dashboard never writes repos: it renders YAML
   + a GitHub web-editor link. App has no contents write.
6. Exact checks stay in code: tests/docs changed, diff size, CODEOWNERS.
7. Model pinned: default `jev-1.13.0`; per-repo `model:`; env `JEV_MODEL`.
   Store the version Jev returns on every run.
8. No reporter-history profiling. Never claim text is AI-generated.
9. External security-looking reports are never filed publicly → `held` bucket
   + alert to `ci_gate.notify_webhook_url` if set.
10. Item text is untrusted state; actions are fixed code paths per answer.

GitHub App permissions: Issues RW, Pull requests RW, Checks RW, Contents R,
Metadata R. Events: installation, installation_repositories, issues,
pull_request, push.

## Jev API (verified from docs.typesafe.ai)
`POST {jev_base_url}/v1/systemone`, header `Authorization: Bearer $TYPESAFE_API_KEY`.
Request: `{"model":"jev-1.13.0","state":"<text>","questions":{"<id>":{...}}}`
- choice: `{"type":"choice","instructions":str,"criteria":{"opt":"desc"|null,...}}` (≤255 options)
- score: `{"type":"score","instructions":str,"criteria":["low desc",...,"high desc"]}` (2–10 levels, index = level)
- noul: `{"type":"noul","instructions":str,"criteria":{"true":str,"false":str}}` (criteria optional)
Response: `{"model":"jev-1.13.0","answers":{"<id>":A},"usage":{"input_tokens":n,"output_tokens":n}}`
- choice A: `{"type":"choice","choice":"x","confidence":1.0,"probabilities":{"x":1.0,...}}`
- score A: `{"type":"score","score":1.43,"confidence":0.35,"legend":{...},"probabilities":{"0":0.0,"1":0.57,"2":0.43}}`
- noul A: `{"type":"noul","noul":0.99}`
Limits: 64k tokens/request, 32k/question. 429 on rate limit. Price $0.042 / 1M input tokens.
Question ids may contain `.` and `#`; to be safe the adapter sends ids with
non-alphanumerics replaced by `_` and maps back.
`instructions` may be a string OR an object (Jev accepts structured instructions). Per-candidate
questions put the candidate in the question, not the shared state:
`spec("gate.same_as", suffix=n, instructions={"candidate": "#12 <title>\n<body excerpt ≤1500 chars>", "question": QUESTIONS["gate.same_as"].instructions})`.
Backends pass objects through (Jev) or JSON-encode them (Anthropic).

## Layout / Ownership

```
backend/  Python 3.12, FastAPI, psycopg3 sync, redis-py   (run: cd backend && uv run ...)
dashboard/ Next.js App Router + TS + Tailwind
site/ static landing page      docs/ docs
```
Orchestrator (done, import don't edit): `backend/pyproject.toml`, `backend/schema.sql`,
`backend/app/{__init__,main,settings,db,redis_client,questions}.py`,
`backend/app/decision/__init__.py`, `backend/tests/conftest.py`.

| Worker | Files |
|---|---|
| W1 decision | `app/decision/jev.py`, `app/decision/anthropic_llm.py`, `app/engine.py`, `tests/test_decision.py`, `tests/test_engine.py` |
| W2 github | `app/github/__init__.py`, `app/github/client.py`, `app/repo_config.py`, `app/install.py`, `app/actions.py`, `tests/test_github.py`, `tests/test_repo_config.py`, `tests/test_actions.py` |
| W3 pipeline | `app/webhooks.py`, `app/worker.py`, `app/jobs.py`, `app/pipeline.py`, `app/features/{__init__,issue_triage,pr_checks,routing,priority_spam,inbound_gate}.py`, `tests/test_webhooks.py`, `tests/test_pipeline.py` |
| W4 ci-gate | `app/api/__init__.py`, `app/api/reports.py`, `app/features/ci_gate.py`, `app/retrieval.py`, `app/ratelimit.py`, `app/notify.py`, `tests/test_ci_gate.py` |
| W5 dashboard-api | `app/auth.py`, `app/api/dashboard.py`, `app/audit.py`, `tests/test_auth.py`, `tests/test_dashboard_api.py` |
| W6 evaluation | `app/backfill.py`, `app/metrics.py`, `app/cli.py`, `tests/test_backfill.py`, `tests/test_metrics.py` |
| W7 frontend | everything under `dashboard/` except `dashboard/Dockerfile` |
| W8 infra | `docker-compose.yml`, `backend/Dockerfile`, `dashboard/Dockerfile`, `.env.example`, `Makefile`, `.github/workflows/*`, `.github/ISSUE_TEMPLATE/*`, `.github/jev-triage.yml`, `app/api/setup.py`, `app-manifest.json`, `LICENSE`, `CONTRIBUTING.md`, `SECURITY.md`, `docs/{self-hosting,configuration,github-app,ci-gate}.md`, `.gitignore` |
| W9 positioning | `README.md`, `site/**`, `docs/{positioning,marketplace-listing,comparison,faq}.md`, `docs/launch/**` |
(`app/...` and `tests/...` paths are under `backend/`.)

## Foundation API (already written)

- `app.settings.settings`: `database_url, redis_url, github_app_id, github_private_key, github_webhook_secret,
  github_client_id, github_client_secret, github_app_slug, session_secret, decision_backend ("jev"|"anthropic"),
  typesafe_api_key, jev_base_url, jev_model, anthropic_api_key, anthropic_model, public_url, dashboard_url,
  dry_run, backfill_limit, retention_days`.
- `app.db`: `fetch_one(sql, params=None)->dict|None`, `fetch_all(...)->list[dict]`, `execute(...)->int`,
  `transaction()` ctx manager → psycopg conn (dict rows), `init_schema()`. `%s`/`%(name)s` placeholders;
  wrap dicts/lists with `psycopg.types.json.Jsonb`.
- `app.redis_client.redis` — `redis.Redis(decode_responses=True)`.
- `app.questions`: `QUESTIONS: dict[str, Question]` (fields `id, type, instructions, criteria, default_threshold, feature`),
  `spec(qid, *, criteria=None, instructions=None, suffix=None) -> QuestionSpec` (suffix gives id `"<qid>#<suffix>"`
  for per-candidate questions like `gate.same_as#123`), `base_id(qid) -> str`.
- `app.decision`: `QuestionSpec(id, type, instructions, criteria)`, `Answer(question_id, answer, probabilities, confidence)`,
  `DecisionResult(model_version, backend, answers, latency_ms, tokens_in, cost_usd, calibrated)`, `DecisionError`,
  `get_backend()` (returns `jev.JevBackend()` or `anthropic_llm.AnthropicBackend()` per settings),
  `pick(type, probabilities) -> (answer, confidence)` (rule 3).
  Backend interface: `.name: str`, `.calibrated: bool`, `.decide(state, questions, model=None) -> DecisionResult`.

## Cross-module signatures

### W1 `app.engine`
```python
@dataclass
class Verdict: question_id: str; decision_id: int; answer: str; probabilities: dict[str, float]
               confidence: float; threshold: float; above: bool; eligible: bool
def run(item: dict, repo: dict, config, trigger: str, state: str, questions: list[QuestionSpec]) -> tuple[int, dict[str, Verdict], str | None]
    # (run_id, verdicts, error). ONE backend call. Inserts decision_runs + decisions(outcome 'pending').
    # threshold = config.thresholds.get(base) or QUESTIONS[base].default_threshold; feature = QUESTIONS[base].feature;
    # mode = config.features[feature].mode. On DecisionError: run row with error, verdicts {}.
def set_outcome(decision_id: int, outcome: str) -> None   # acted|queued|shadow|skipped
```

### W2 `app.github` (exports `GitHubClient`, `app_jwt`, `installation_token`, `verify_signature`)
```python
class GitHubClient:  # per installation; httpx; retries on 5xx/secondary rate limit
    def __init__(self, installation_id: int)
    def request(self, method, path, **kw) -> Any ; def paginate(self, path, params=None, max_items=None) -> Iterator[dict]
    def graphql(self, query, variables) -> dict
    def add_labels(repo, number, labels) ; remove_label(repo, number, label)  # 404 ignored
    def list_labels(repo) -> list[str] ; create_label(repo, name, color="ededed", description="")
    def create_comment(repo, number, body) -> dict ; update_comment(repo, comment_id, body) -> dict
    def create_issue(repo, title, body, labels) -> dict ; add_assignees(repo, number, logins)
    def create_check_run(repo, head_sha, **fields) -> dict ; update_check_run(repo, check_run_id, **fields) -> dict
    def get_file(repo, path, ref=None) -> tuple[str, str] | None   # (text, blob sha)
    def get_tree_paths(repo, ref="HEAD") -> set[str]                # cached in redis 1h
    def get_pr_files(repo, number) -> list[dict]
    def search_issues(q, max_items=10) -> list[dict]
    def original_body(repo, number) -> str | None   # oldest userContentEdits diff; None if never edited
    def timeline(repo, number) -> list[dict]
    def permission(repo, login) -> str | None      # admin|maintain|write|triage|read|None
def verify_signature(body: bytes, header: str | None) -> bool
def installation_for_repo(repo_row) -> int   # via orgs.github_installation_id
def client_for(repo_row) -> GitHubClient
```
`repo` args are `"owner/name"`.

### W2 `app.repo_config`
```python
class FeatureConfig(BaseModel): mode: Literal["off","shadow","auto"] = "shadow"
class AreaConfig(BaseModel): owner: str | None = None; paths: list[str] = []; description: str = ""
class CIGateConfig(BaseModel): max_issues_per_hour: int = 5; notify_webhook_url: str | None = None
class EvaluationConfig(BaseModel): min_samples: int = 30; require_evaluation: bool = True
class RepoConfig(BaseModel):
    features: dict[str, FeatureConfig]  # inbound_gate, issue_triage, pr_checks, routing, priority, spam, ci_gate
                                         # all default shadow except spam "off"
    labels: dict[str, Any]   # "issue.type": {bug: "bug", ...}, "priority": {p0..p3}, plus string keys:
                             # needs_info, needs_tests, needs_docs, breaking, spam, held, duplicate, review, security, ci
    thresholds: dict[str, float] = {}; areas: dict[str, AreaConfig] = {}; rules_file: str | None = None
    comments: bool = False; model: str | None = None
    ci_gate: CIGateConfig = CIGateConfig(); evaluation: EvaluationConfig = EvaluationConfig()
    core_team: list[str] = ["OWNER", "MEMBER", "COLLABORATOR"]   # author_association values
    def label(self, key: str, answer: str | None = None) -> str | None
    def mode(self, feature: str) -> str
def parse_config(yaml_text: str | None, org_yaml: str | None = None) -> RepoConfig   # deep-merge default<org<repo; raises ValueError on invalid
def load(repo_row: dict, refresh: bool = False) -> RepoConfig
    # uses repos.config jsonb unless refresh/missing; refresh fetches files via client_for, updates
    # repos.config, config_source, config_sha, rules_text, rules_sha
def render_yaml(data: dict) -> str
def edit_url(full_name: str, branch: str, yaml_text: str, exists: bool) -> str
```

### W2 `app.install`
```python
def handle_installation(event: str, payload: dict) -> None   # upsert orgs/repos; deletes org on installation.deleted
def ensure_labels(repo_row: dict) -> list[str]               # create missing configured labels; returns created
```
Private repos inserted `enabled=false`; public `enabled=true`.

### W2 `app.actions` (all GitHub writes go here; each inserts an `actions` row; `settings.dry_run` → record only)
```python
def label(item: dict, repo: dict, labels: list[str], decision_id: int | None) -> None
def unlabel(item, repo, label: str, decision_id) -> None
def comment(item, repo, body: str, decision_id, key: str) -> None   # once per (item, key) via comment_state; edits prior bot comment
def assign(item, repo, logins, decision_id) -> None
def file_issue(repo, title, body, labels, decision_id) -> dict
def check_run(item, repo, head_sha, title, summary_md, decision_id) -> None   # one "Jev Triage" check per sha, conclusion neutral
```

### W3 `app.pipeline`
```python
@dataclass
class Ctx: repo: dict; config: RepoConfig; item: dict; trigger: str
           extra: dict = field(default_factory=dict); held: bool = False
def upsert_item(repo, kind, number, title, body, author, association, url, source, state="open", created_at=None, extra=None) -> dict
def enqueue_review(item_id, feature, reason, bucket="review") -> int   # one open row per (item_id, bucket)
def process(repo: dict, kind: str, payload: dict, trigger: str, actions_enabled: bool = True) -> int | None  # returns run_id
```
Feature modules export `FEATURE`, `enabled(ctx)`, `questions(ctx)`, `apply(ctx, verdicts)`; `apply` must call
`engine.set_outcome` on each of its verdicts. Pipeline: gather questions from enabled features → `engine.run` once
→ apply in order inbound_gate, issue_triage/pr_checks, priority_spam, routing. If gate sets `ctx.held`, later
features mark their verdicts `skipped`. `actions_enabled=False` (backfill) → features record `shadow`, no queue rows.
`trigger == "release"` (maintainer released a held item) skips inbound_gate. `payload` for issues/prs needs at least
`number, title, body, user.login, author_association, html_url, created_at` (PRs also `head.sha`, `draft`).
Items authored by bots (`user.type == "Bot"` or login ending `[bot]`) are ignored to avoid loops.
State text is markdown sections: `## Title`, `## Body` (≤6000 chars), and per feature `## Repository facts`,
`## Contributing rules` (≤4000), `## Changed files`, `## Areas`, `## Repositories`. Never include the item's current labels.
Shared helper every feature uses (in pipeline): `decide(ctx, verdict) -> "act"|"queue"|"shadow"` per rules 1-2.

### W3 `app.jobs`
```python
def enqueue(job_type: str, **payload) -> None    # Redis list "jev:jobs", json {type, payload, attempts}
HANDLERS: dict[str, Callable[..., None]]          # webhook, backfill, sync_repo, purge
```
Worker `python -m app.worker`: BLPOP loop; 3 attempts then `jev:jobs:dead`; nightly-ish purge of `state_text` and
item bodies older than `retention_days`.

### W4
```python
app.retrieval.similar(repo_id, text, k=10, exclude_item_id=None, kinds=("issue",), open_only=True) -> list[dict]  # Postgres FTS; rows + score
app.ratelimit.allow(key, limit, window_s) -> bool
app.notify.send(url, text) -> None   # Slack-compatible {"text"}; never raises
app.features.ci_gate.process_report(report_id) -> dict  # {report_id, outcome, issue_number, merged_into, decision_ids}
```
`POST /api/v1/reports`, `Authorization: Bearer <ci token>` (sha256 in `ci_tokens`). Body
`{repo, title, body, failing_test?, log_excerpt?, commit_sha?, run_url?, source: "ci"|"external"}`.
CI processed synchronously; outcomes `filed|merged|flaky|infra|queued|rate_limited`. External: gate questions
only, never filed, outcome `held|queued`.

### W5 `app.auth`
```python
router                     # GET /api/auth/login, GET /api/auth/callback, POST /api/auth/logout
@dataclass class User: id: int; login: str; avatar_url: str; token: str
def current_user(request: Request) -> User         # dependency; 401
def role(user, repo_row) -> str | None             # admin|maintainer|viewer, via GitHubClient.permission, redis cache 5m
def require_repo(user, repo_id, min_role="viewer") -> dict
```
GitHub App user OAuth (`github_client_id/secret`), state param checked. Session id in signed httpOnly cookie
`jt_session` → `sessions` table. Permission map: admin→admin; maintain/write/triage→maintainer; read→viewer.

### W6
```python
app.metrics: question_stats(repo_id, qid) -> QuestionStats(question_id, n, accuracy, ece)  # redis cache 60s
  calibration(repo_id, qid, bins=10); confusion(repo_id, qid); worst_misses(repo_id, qid, limit=20)
  preview_points(repo_id, qid); recommended_threshold(repo_id, qid, max_error=0.05); overview(org_id, days=30)
app.backfill.run(repo_id, limit=None) -> dict
app.cli  # `python -m app.cli eval owner/repo [--limit N]` prints accuracy table (offline-friendly)
```
Truth = `ground_truth` row for (item, base question) compared to the latest non-error decision. Backfill: closed
issues + merged PRs (limit), original body via `original_body`, labels from earliest non-bot `labeled` timeline
events mapped through config labels, duplicates via `marked_as_duplicate`/`state_reason=="duplicate"`; then
`pipeline.process(..., trigger="backfill", actions_enabled=False)`. Accuracy is an upper bound (say so).

## HTTP API (W5 implements, W7 consumes) — JSON under `/api`, cookie auth
Page = `{items: T[], next_cursor: string|null}` with `?cursor=&limit=` (default 50, max 200). Errors `{detail}`.
```ts
type Role="admin"|"maintainer"|"viewer"; type Mode="off"|"shadow"|"auto";
GET /api/me -> {login, avatar_url, orgs:{id, login, avatar_url}[]}
GET /api/orgs/:orgId/overview -> {org:{id,login}, repos: RepoCard[]}
 RepoCard={id, full_name, private, enabled, role, items_30d, acted_share:number|null, queued_open, held_open,
           accuracy:number|null, override_rate:number|null, trend:{date, acted, queued, shadow}[]}
GET /api/repos/:id -> {id, full_name, private, enabled, role, default_branch, backend, model, calibrated:boolean,
   features: Record<string,Mode>, backfill_status:string|null, config_source:"repo"|"org"|"default",
   questions:{id, feature, type:"choice"|"score"|"noul", threshold, default_threshold, n, accuracy:number|null, measured:boolean}[]}
PATCH /api/repos/:id {enabled, acknowledge_private?} (admin; enabling private needs ack) -> same as GET
GET /api/repos/:id/queue?bucket=review|held -> Page<QueueEntry>
 QueueEntry={id, item:ItemSummary, feature, reason, bucket, created_at, age_hours, suggestions:Suggestion[]}
 ItemSummary={id, kind:"issue"|"pr"|"ci_report"|"report", number:number|null, title, html_url:string|null, author:string|null, created_at}
 Suggestion={decision_id, question_id, answer, confidence, threshold, options:string[], probabilities:Record<string,number>}
POST /api/queue/:qid/resolve {action:"accept"|"dismiss"|"release", answers?:Record<decision_id,string>} -> {ok:true}
   accept: ground truth for each suggestion (answers override), applies label actions for changed/confirmed answers.
   dismiss: close, no truth. release (held): close + truth gate passed + re-run triage.
GET /api/items/:id -> {item: ItemSummary & {body, repo_id, state}, runs:{id, trigger, model_version, backend, calibrated,
   latency_ms, tokens_in, cost_usd, created_at, error, state_text, decisions:{id, question_id, answer, confidence,
   threshold, outcome, probabilities}[]}[], actions:{id, kind, github_ref, dry_run, created_at}[],
   overrides:{id, decision_id, user, new_answer, created_at}[]}
POST /api/decisions/:id/override {answer} -> {ok:true}   (maintainer)
GET /api/repos/:id/preview?question_id= -> {question_id, threshold, points:{confidence, correct:boolean|null}[]}
GET /api/repos/:id/calibration?question_id= -> {question_id, n, ece:number|null, bins:{lo, hi, n, mean_confidence, accuracy}[]}
GET /api/repos/:id/evaluation -> {backfill_status, upper_bound_note, questions:{id, n, accuracy, ece, recommended_threshold,
   confusion:{labels:string[], matrix:number[][]}|null, worst_misses:{item_id, number, title, answer, truth, confidence, html_url}[]}[]}
POST /api/repos/:id/backfill -> {queued:true} (maintainer)
GET /api/repos/:id/ci-reports -> Page<{id, created_at, title, source, outcome, issue_number, merged_into, run_url,
   candidates:{item_id, number, title, retrieval_score, same_as_probability:number|null}[]}>
GET /api/repos/:id/flaky-tests -> {items:{test_id, occurrences, first_seen, last_seen, last_run_url}[]}
GET /api/repos/:id/config -> {yaml, source, parsed, edit_url, labels:string[]}
POST /api/repos/:id/config/render {parsed} -> {yaml, edit_url, errors:string[]}
POST /api/repos/:id/labels/sync -> {created:string[]} (maintainer)
GET /api/repos/:id/ci-tokens -> {items:{id, name, created_by, created_at, revoked_at}[]}
POST /api/repos/:id/ci-tokens {name} -> {id, name, token} (admin; shown once)
DELETE /api/repos/:id/ci-tokens/:tokenId -> {ok:true} (admin)
GET /api/repos/:id/audit -> Page<{id, actor, action, target, details, created_at}>
GET /api/health -> {ok, backend, model}
```
Also: `POST /api/github/webhook` (W3), `POST /api/v1/reports` (W4), `GET /api/setup` + `/api/setup/callback` (W8,
GitHub App manifest flow that writes credentials to `.env` for self-hosters). Dashboard proxies `/api/*` to
`API_URL` via Next.js rewrite. Dates are ISO-8601 UTC strings.

## v0.2 additions: onboarding, demo mode, DX (B1 implements, dashboard consumes)
```ts
GET /api/setup/status (no auth) -> {app_configured:boolean, app_slug:string|null, install_url:string|null,
   setup_url:string|null /* "/api/setup" when app not configured */, decision_backend:"jev"|"anthropic",
   decision_key_present:boolean, calibrated:boolean, model:string, public_url:string, dashboard_url:string,
   demo_mode:boolean, installations:number}
GET /api/repos/:id/onboarding -> {complete:boolean, steps:{id:"enabled"|"labels"|"config"|"backfill"|"first_event"|"mode",
   title:string, done:boolean, optional:boolean, detail:string|null}[]}
GET /api/repos/:id/labels/plan -> {existing:string[], missing:string[], mapping:Record<string,Record<string,string>|string>}
GET /api/repos/:id/backfill -> {status:"idle"|"queued"|"running"|"done"|"error", processed:number, total:number|null,
   with_truth:number, errors:number, error:string|null, started_at:string|null, finished_at:string|null}
POST /api/repos/:id/config/render accepts {yaml:string} OR {parsed:object} -> {yaml, parsed, edit_url, errors:string[]}
GET /api/repos/:id additionally returns config_error:string|null (YAML in repo failed to parse; defaults in use)
POST /api/repos/:id/features {feature, mode} -> {yaml, edit_url}  // renders the YAML change; still committed via GitHub
```
Demo mode (`DEMO_MODE=true`): `/api/auth/login` signs in user `demo` without GitHub, role admin on demo repos,
all GitHub writes forced dry-run, `/api/me` lists the demo org. `python -m app.cli demo` seeds org `demo-org`
(repos `demo-org/api`, `demo-org/web`) with ~60 days of realistic items, runs, decisions (plausibly calibrated),
ground truth, overrides, open queue + held entries, CI reports, flaky tests, audit rows. Idempotent (wipes demo org first).

## Routers mounted in `app/main.py`
`app.auth.router`, `app.api.dashboard.router`, `app.webhooks.router`, `app.api.reports.router`, `app.api.setup.router`.
Each is an `APIRouter()` with full paths (no prefix).

## Tests
`cd backend && uv run pytest tests/test_<yours>.py`. Uses `TEST_DATABASE_URL`
(default `postgresql://jev:jev@localhost:55432/jev`) and `TEST_REDIS_URL` (default `redis://localhost:56379/15`);
running containers exist. `conftest.py` applies schema and truncates tables before each test and provides
fixtures `org`, `repo` (rows). Never hit the network: monkeypatch `GitHubClient` methods / `app.decision.get_backend`.
