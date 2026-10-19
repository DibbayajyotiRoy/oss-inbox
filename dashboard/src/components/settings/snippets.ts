// Ready-to-paste CI snippets (docs/ci-gate.md). Templates, not logic: keep them in step with the docs.

/** A workflow step. Reads the secrets OSS_INBOX_URL and OSS_INBOX_CI_TOKEN, so no token is ever pasted into a workflow file. */
export const ACTIONS_STEP = `- name: Report failure to OSS Inbox
  if: failure() && github.event_name == 'push'   # secrets are not available to fork PRs
  continue-on-error: true
  env:
    OSS_INBOX_URL: \${{ secrets.OSS_INBOX_URL }}
    OSS_INBOX_CI_TOKEN: \${{ secrets.OSS_INBOX_CI_TOKEN }}
  run: |
    # expects your test step to tee its output: make test 2>&1 | tee test.log
    jq -n \\
      --arg repo "$GITHUB_REPOSITORY" \\
      --arg title "CI failed: $GITHUB_WORKFLOW / $GITHUB_JOB on $GITHUB_REF_NAME" \\
      --arg body "Commit $GITHUB_SHA" \\
      --arg log "$(tail -c 6000 test.log)" \\
      --arg sha "$GITHUB_SHA" \\
      --arg run "$GITHUB_SERVER_URL/$GITHUB_REPOSITORY/actions/runs/$GITHUB_RUN_ID" \\
      '{repo: $repo, title: $title, body: $body, log_excerpt: $log, commit_sha: $sha, run_url: $run, source: "ci"}' |
    curl -fsS -X POST "$OSS_INBOX_URL/api/v1/reports" \\
      -H "Authorization: Bearer $OSS_INBOX_CI_TOKEN" -H "Content-Type: application/json" -d @-
`;

export const curlReport = (origin: string, token: string, repo: string) => `curl -fsS -X POST "${origin}/api/v1/reports" \\
  -H "Authorization: Bearer ${token}" \\
  -H "Content-Type: application/json" \\
  -d '{
    "repo": "${repo}",
    "title": "test_checkout_total fails on main",
    "body": "Fails since the pricing refactor.",
    "failing_test": "tests/test_cart.py::test_checkout_total",
    "log_excerpt": "AssertionError: 1999 != 2000",
    "commit_sha": "3f2a9c1",
    "run_url": "https://github.com/${repo}/actions/runs/123",
    "source": "ci"
  }'
`;
