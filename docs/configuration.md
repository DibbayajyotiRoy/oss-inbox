# Configuration

Config lives in your repository as `.github/jev-triage.yml`. The file is the source of truth: the dashboard shows it, previews changes, and gives you a GitHub web-editor link, but never writes to your repo (the App has no `contents: write`).

- No file means defaults: every feature in `shadow`, `spam` off, no comments.
- Org-wide defaults go in `<org>/.github` at the same path. Merge order is defaults, then org, then repo (nested keys merge).
- Changes are picked up when the file is pushed to the default branch. Unknown keys or bad values make the whole file invalid, and Jev falls back to the defaults (which never act) until you fix it.

## Full reference

```yaml
features:                       # off | shadow | auto  (default shadow, spam: off). Quote "off": bare off is YAML for false
  inbound_gate: {mode: shadow}  # issues from outside core_team: hold security claims, ungrounded and known non-issues; suggest duplicates
  issue_triage: {mode: shadow}  # issue type, missing reproduction / version / logs
  pr_checks: {mode: shadow}     # breaking change, follows contributing rules, tests/docs/size/CODEOWNERS checks
  routing: {mode: shadow}       # which repo (org-wide) and which area
  priority: {mode: shadow}      # p0..p3
  spam: {mode: "off"}
  ci_gate: {mode: shadow}       # CI failures posted to /api/v1/reports (docs/ci-gate.md)

labels:                         # label names Jev applies; "Sync labels" in the dashboard creates missing ones
  issue.type: {bug: bug, feature: enhancement, question: question, docs: documentation}
  priority: {p0: "priority: p0", p1: "priority: p1", p2: "priority: p2", p3: "priority: p3"}
  needs_info: needs-info
  needs_tests: needs-tests
  needs_docs: needs-docs
  breaking: breaking-change
  spam: spam
  held: "jev: held"
  duplicate: duplicate
  review: "jev: needs review"
  security: security
  ci: ci-report
  route.area: {}                # area name -> label; default is "area: <name>"

thresholds: {}                  # question id -> minimum confidence to act, 0..1; defaults below
  # issue.type: 0.9

areas:                          # components, used by routing and CI filing
  api:
    owner: "@acme/api-team"     # optional
    paths: ["src/api/**"]       # optional
    description: "HTTP handlers and request validation"   # what the model reads; make it specific

rules_file: null                # path to your contributing rules; default: first found of
                                # AGENTS.md, CONTRIBUTING.md, .github/CONTRIBUTING.md, docs/CONTRIBUTING.md
comments: false                 # true allows Jev to post comments. Silent by default, for every feature
model: null                     # pin a Jev model version for this repo, e.g. jev-1.13.0 (default: JEV_MODEL)

ci_gate:
  max_issues_per_hour: 5        # CI failures filed per hour before outcome becomes rate_limited
  notify_webhook_url: null      # Slack-compatible webhook: infrastructure failures and held reports

evaluation:
  require_evaluation: true      # auto mode needs measured accuracy for the question (see below)
  min_samples: 30               # labeled samples needed before a question counts as measured

core_team: [OWNER, MEMBER, COLLABORATOR]   # author_association values counted as core team; their issues skip inbound_gate
```

Most files are short. This is a complete, useful config:

```yaml
features:
  issue_triage: {mode: auto}
areas:
  cli: {paths: ["cmd/**"], description: "Command-line interface and flags"}
  parser: {paths: ["src/parse/**"], description: "Lexer, parser and error messages"}
```

## Questions and default thresholds

Every automated decision answers one typed question. A decision acts only when its confidence reaches the threshold.

| Feature | Question | Default threshold |
|---|---|---|
| issue_triage | `issue.type` | 0.85 |
| issue_triage | `issue.has_repro`, `issue.has_version`, `issue.has_logs` | 0.80 |
| pr_checks | `pr.breaking` | 0.90 |
| pr_checks | `pr.follows_rules` | 0.80 |
| routing | `route.repo` | 0.90 |
| routing | `route.area` | 0.85 |
| priority | `priority` | 0.90 |
| spam | `spam` | 0.95 |
| inbound_gate | `gate.reproducible`, `gate.grounded`, `gate.claim_supported` | 0.85 |
| inbound_gate | `gate.known_non_issue`, `gate.same_as` | 0.90 |
| inbound_gate | `gate.security_claim` | 0.80 |
| ci_gate | `ci.kind` | 0.85 |
| ci_gate | `ci.same_as` | 0.90 |

Confidence is the probability of the chosen answer. For yes/no questions the answer is `true` when p >= 0.5, and confidence is `max(p, 1-p)`.

## Modes

| Mode | What happens |
|---|---|
| `off` | Feature does not run. |
| `shadow` (default) | Decisions are recorded and items go to the review queue with suggested answers. Nothing is written to GitHub. |
| `auto` | Decisions that are *eligible* are applied (labels, assignees, the neutral "Jev Triage" check). The rest go to the queue. |

Fixed rules, whatever the mode: Jev never closes, deletes, locks or transfers anything. Duplicate links and transfers are only suggestions in the queue (CI failures are the exception: a failure that matches an open issue is merged into it). Reports that look like security issues from outside the core team are never filed publicly; they go to the `held` queue, and to `ci_gate.notify_webhook_url` if set. With `DRY_RUN=true` in `.env`, even `auto` only records what it would have done.

## From shadow to auto

A decision is eligible when all three hold:

1. its feature is `auto`;
2. its confidence is at least the question's threshold;
3. the question is **measured** (unless `evaluation.require_evaluation: false`): at least `evaluation.min_samples` labeled samples, with accuracy at or above the threshold.

Labeled samples come from two places: a backfill over your closed issues and merged PRs, and your own queue decisions (accept or override a suggestion and that answer becomes ground truth).

The path:

1. Install and leave everything on `shadow`.
2. Run the backfill: dashboard, repo, Evaluation, **Run backfill**; or `docker compose exec api python -m app.cli eval owner/repo`. `BACKFILL_LIMIT` caps how many closed issues and merged PRs it reads.
3. Work the review queue for a week. Accept or fix the suggestions.
4. Read the Evaluation page: accuracy, calibration, a recommended threshold per question, and a preview of what each threshold would have acted on.
5. Switch features to `auto` one at a time, starting with the ones that are measured (`issue_triage` is usually first). Commit the YAML the dashboard renders for you.

Backfill accuracy is an upper bound: the truth is the first label a maintainer applied to closed items, so unlabeled items are excluded and live traffic is messier. Expect lower numbers in production and keep reading the queue.

Turn on `comments: true` only once you are happy with the labels. It applies to every feature.
