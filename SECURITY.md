# Security policy

## Reporting a vulnerability

Please report privately through GitHub: **Security > Report a vulnerability** on this repository ([private vulnerability reporting](https://docs.github.com/en/code-security/security-advisories/guidance-on-reporting-and-writing-information-about-vulnerabilities/privately-reporting-a-security-vulnerability)). Do not open a public issue or discussion. We aim to acknowledge reports within 5 days and will credit you in the advisory unless you prefer otherwise.

## Scope

In scope: this repository's code and its default Docker setup, notably

- webhook signature verification and the GitHub App credential handling,
- dashboard sign-in, sessions and per-repo roles,
- CI tokens and `/api/v1/reports`,
- the `/api/setup` manifest flow,
- one org's data becoming visible to another,
- issue or PR text (which is untrusted) causing an action other than the fixed label, assign, check or file-issue paths.

Out of scope: a wrong label or a model misjudgment (open a normal issue; accuracy is measured, not guaranteed), vulnerabilities in GitHub, TypeSafe or Anthropic themselves, and deployments that expose Postgres or Redis, run without HTTPS, or keep the default `SESSION_SECRET`.

## What is stored

In your own Postgres, never sent elsewhere except as described in [docs/github-app.md](docs/github-app.md):

- Installation and repo metadata, and your parsed `.github/jev-triage.yml`.
- Issue, PR and CI report titles, bodies and authors' logins, and the exact text sent to the decision backend for each decision.
- Decisions (answer, confidence, model version), actions taken, overrides, ground-truth labels, and an audit log.
- Dashboard sessions, including the signed-in user's GitHub user-to-server token, until the session expires.
- CI tokens as SHA-256 hashes only.

The GitHub App private key, webhook secret and client secret live in your `.env`, not the database.

## Retention

The worker removes issue/PR text and the stored decision text older than `RETENTION_DAYS` (default 365). Decisions, actions and the audit log are kept so accuracy history survives. Uninstalling the App deletes that org's rows. To remove everything, `docker compose down -v`.
