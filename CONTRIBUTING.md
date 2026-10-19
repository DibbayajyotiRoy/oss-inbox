# Contributing

OSS Inbox is a FastAPI backend (`backend/`) and a Next.js dashboard (`dashboard/`). Keep changes small: write what is needed, no speculative config or abstractions.

## Dev setup

You need Docker, [uv](https://docs.astral.sh/uv/), Node 22 and pnpm.

```bash
make dev                                   # postgres + redis in Docker; prints the three commands to run
cd backend && uv sync                      # python deps
cd dashboard && pnpm install               # dashboard deps
```

To receive real webhooks locally, see "Webhooks on localhost" in [docs/self-hosting.md](docs/self-hosting.md). Keep `DRY_RUN=true` while developing.

## Tests

Backend tests use a real Postgres and Redis and never touch the network (GitHub and the decision backend are monkeypatched).

```bash
make test-services   # throwaway postgres on :55432 and redis on :56379 (the test defaults)
make test            # cd backend && uv run pytest -q
make dashboard-build # production build of the dashboard
```

Override the targets with `TEST_DATABASE_URL` and `TEST_REDIS_URL`. Tests wipe those databases, so never point them at real data. Add one small test file per module covering its real branches.

## Pull requests

- One logical change per PR; link the issue it fixes.
- `make test` and `make dashboard-build` pass. CI runs both and builds the Docker images.
- Product rules are not up for drift without discussion: features default to `shadow`, nothing acts below its threshold or without measured accuracy, no comments unless `comments: true`, never close, delete, lock or transfer, never profile reporters, never claim text is AI-generated, and item text is untrusted.

### Changing the question library

The questions in `backend/app/questions.py` (instructions, criteria, default thresholds) decide what the bot does, so changes need evidence. A PR that adds or edits a question must include evaluation results in its description:

1. Run `docker compose exec api python -m app.cli eval owner/repo` (or `cd backend && uv run python -m app.cli eval owner/repo`) on at least one public repo, before and after your change.
2. Paste the accuracy table (`n`, accuracy, ECE, recommended threshold) for the affected question(s), the repo, and the `--limit` you used.
3. Say what the numbers don't show: backfill accuracy is an upper bound.

A new default threshold needs the same table to justify it.

## Reporting bugs and security issues

Use the issue forms. For vulnerabilities, follow [SECURITY.md](SECURITY.md) and do not open a public issue.

By contributing you agree your work is licensed under Apache-2.0.
