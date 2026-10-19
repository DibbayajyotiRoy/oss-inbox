# CI gate

When your CI fails, post the failure to OSS Inbox. It looks for an open issue about the same problem and then decides what to do, so one flaky test does not become forty issues.

Per failure it answers two questions: what caused it (`ci.kind`: real bug, flaky test, or infrastructure) and whether it is the same problem as a candidate open issue (`ci.same_as`). Candidates come from full-text search over the repo's open issues. It never closes anything.

Like every feature, `ci_gate` starts in `shadow`: reports are recorded and queued with the suggested outcome, and nothing is filed. Switch it on with `features: {ci_gate: {mode: auto}}` ([configuration.md](configuration.md)).

## 1. Create a token

Tokens are per repository and shown once; only a SHA-256 hash is stored.

- Dashboard: open the repo, go to its CI gate settings, create a token. Admins only. Revoke it there too.
- Or from the server: `docker compose exec api python -m app.cli token owner/repo ci-main`

Save it as the secret `OSS_INBOX_CI_TOKEN`, and your API address (`PUBLIC_URL`) as `OSS_INBOX_URL`.

## 2. Post a failure

```bash
curl -fsS -X POST "$OSS_INBOX_URL/api/v1/reports" \
  -H "Authorization: Bearer $OSS_INBOX_CI_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "repo": "acme/widgets",
    "title": "test_checkout_total fails on main",
    "body": "Fails since the pricing refactor.",
    "failing_test": "tests/test_cart.py::test_checkout_total",
    "log_excerpt": "AssertionError: 1999 != 2000",
    "commit_sha": "3f2a9c1",
    "run_url": "https://github.com/acme/widgets/actions/runs/123",
    "source": "ci"
  }'
```

| Field | Required | Notes |
|---|---|---|
| `repo` | yes | `owner/name`; must match the token's repo |
| `title` | yes | up to 256 characters |
| `body` | no | up to 65,000 characters |
| `failing_test` | no | A stable test id; the flaky-test list is keyed on it |
| `log_excerpt` | no | up to 20,000 characters; only the first 3000 reach the model |
| `commit_sha`, `run_url` | no | Linked in filed issues |
| `source` | no | `ci` (default) or `external` |

Response: `{"report_id", "outcome", "reason", "issue_number", "merged_into", "decision_ids", "shadow"}`. CI reports are processed synchronously. Errors: `401` bad or revoked token, `403` wrong repo or repo not enabled, `429` more than 120 requests a minute.

## 3. GitHub Actions example

```yaml
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: set -o pipefail; make test 2>&1 | tee test.log

      - name: Report failure to OSS Inbox
        if: failure() && github.event_name == 'push'   # secrets are not available to fork PRs
        continue-on-error: true
        env:
          OSS_INBOX_URL: ${{ secrets.OSS_INBOX_URL }}
          OSS_INBOX_CI_TOKEN: ${{ secrets.OSS_INBOX_CI_TOKEN }}
        run: |
          jq -n \
            --arg repo "$GITHUB_REPOSITORY" \
            --arg title "CI failed: $GITHUB_WORKFLOW / $GITHUB_JOB on $GITHUB_REF_NAME" \
            --arg body "Commit $GITHUB_SHA" \
            --arg log "$(tail -c 6000 test.log)" \
            --arg sha "$GITHUB_SHA" \
            --arg run "$GITHUB_SERVER_URL/$GITHUB_REPOSITORY/actions/runs/$GITHUB_RUN_ID" \
            '{repo: $repo, title: $title, body: $body, log_excerpt: $log, commit_sha: $sha, run_url: $run, source: "ci"}' |
          curl -fsS -X POST "$OSS_INBOX_URL/api/v1/reports" \
            -H "Authorization: Bearer $OSS_INBOX_CI_TOKEN" -H "Content-Type: application/json" -d @-
```

If you can, send one report per failing test with `failing_test` set: the flaky-test list is keyed on it (falling back to the title), and a specific title dedupes better than "job failed".

## Outcomes

| `outcome` | Meaning | Needs |
|---|---|---|
| `filed` | New failure, no matching issue: OSS Inbox opened an issue (labeled `ci-report`, plus priority/area when confident). | `auto`, `ci.kind` above threshold |
| `merged` | Matches an open issue: nothing new is filed and the report is attached to it (`merged_into`). A note is posted on that issue only if `comments: true`. | `auto`, `ci.same_as` above threshold |
| `flaky` | Judged a flaky test. No issue; the test and its count appear under Flaky tests in the dashboard. | `auto`, `ci.kind` above threshold |
| `infra` | Judged a runner/network/registry problem. No issue; `ci_gate.notify_webhook_url` gets a message if set. | `auto`, `ci.kind` above threshold |
| `rate_limited` | Would have filed, but `ci_gate.max_issues_per_hour` (default 5) was reached. Raise the limit or wait. | |
| `queued` | Not acted on: `shadow` mode, confidence below threshold, the question is not measured yet, a possible duplicate needs a human, or the feature is off. `reason` says which. A maintainer decides in the review queue. | |

The default thresholds are 0.85 for `ci.kind` and 0.90 for `ci.same_as`.

## External reports

`"source": "external"` runs the inbound gate instead (reproducible? grounded in the repo? known non-issue? claims a vulnerability?). External reports are never filed publicly: the outcome is `queued`, or `held` if the report claims a security issue, is not grounded in the repo, or describes a documented non-issue. Held reports show in the dashboard's held queue and are sent to `ci_gate.notify_webhook_url` if set.
