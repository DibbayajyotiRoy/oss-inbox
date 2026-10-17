# Self-hosting

Jev Triage runs as five containers: Postgres, Redis, the API, a worker, and the dashboard. You need Docker with Compose v2, a [TypeSafe API key](https://typesafe.ai), and a GitHub account or org that can own an App.

## Five-minute install

```bash
git clone https://github.com/YOUR-ORG/jev-triage && cd jev-triage
cp .env.example .env
```

Edit `.env`:

```bash
TYPESAFE_API_KEY=...      # from https://typesafe.ai
SESSION_SECRET=...        # output of: openssl rand -hex 32
DRY_RUN=true              # keep true for the first install
```

No TypeSafe key? Set `DECISION_BACKEND=anthropic` and `ANTHROPIC_API_KEY`. Confidences from that backend are **uncalibrated**, so the dashboard flags them and thresholds mean much less. Use it to try the app, not to run `auto` mode.

Start everything, then create the GitHub App:

```bash
docker compose up -d --build
```

1. Open <http://localhost:8000/api/setup> (add `?org=<your-org>` to create the App under an organization).
2. Click **Create GitHub App** and confirm on GitHub. GitHub sends you back to the API, which appends `GITHUB_APP_ID`, `GITHUB_APP_SLUG`, `GITHUB_PRIVATE_KEY`, `GITHUB_WEBHOOK_SECRET`, `GITHUB_CLIENT_ID` and `GITHUB_CLIENT_SECRET` to `.env`. If the file is not writable, the page prints the lines for you to paste.
3. Restart so the API and worker read them: `docker compose restart api worker`
4. Follow the install link on the page (`https://github.com/apps/<slug>/installations/new`) and pick your repositories.
5. Open <http://localhost:3000>, sign in with GitHub, and look at your repos.

`/api/setup` returns 404 once `GITHUB_APP_ID` is set. To skip the flow, create the App by hand: [github-app.md](github-app.md).

New installs start in `shadow` mode everywhere: decisions are recorded and queued for review, nothing is written to GitHub. Add a `.github/jev-triage.yml` to change that ([configuration.md](configuration.md)). Public repositories are enabled on install; private repositories stay off until an admin opts in on the dashboard.

## Webhooks on localhost (smee)

GitHub cannot reach `localhost`. Forward deliveries with [smee.io](https://smee.io):

```bash
# 1. open https://smee.io/new and copy the channel URL
# 2. in https://github.com/settings/apps/<slug> set "Webhook URL" to that channel URL
make smee SMEE_URL=https://smee.io/<channel>
```

Or skip smee and expose the API through any tunnel: set `PUBLIC_URL` to the tunnel's https URL in `.env` *before* step 1 above, because the App's webhook and callback URLs are generated from it.

Check delivery in the App's **Advanced > Recent deliveries** tab. A healthy API answers `2xx`.

## Production

**HTTPS.** Put a reverse proxy in front and send `/api/*` straight to the API (webhook signatures need the untouched body) and everything else to the dashboard. Caddy:

```
triage.example.com {
    handle /api/* { reverse_proxy 127.0.0.1:8000 }
    handle        { reverse_proxy 127.0.0.1:3000 }
}
```

Set `PUBLIC_URL=https://triage.example.com` and `DASHBOARD_URL=https://triage.example.com` **before** running `/api/setup`; the App's webhook URL, setup callback and OAuth callback are generated from them. Change the `ports:` entries in `docker-compose.yml` to `127.0.0.1:8000:8000` and `127.0.0.1:3000:3000` so only the proxy is exposed. Set `SESSION_SECRET` to a random value.

**Going live.** Stay on `DRY_RUN=true` and `shadow` until the dashboard shows measured accuracy for the questions you care about ([configuration.md](configuration.md#from-shadow-to-auto)). Then set `DRY_RUN=false` in `.env` and `docker compose up -d`; features still only act in `auto` mode.

**Backups.** Postgres holds everything worth keeping. Redis only holds the job queue and caches.

```bash
docker compose exec -T postgres pg_dump -U jev jev | gzip > jev-$(date +%F).sql.gz   # backup
gunzip -c jev-2026-01-01.sql.gz | docker compose exec -T postgres psql -U jev jev    # restore into an empty db
```

Also keep a copy of `.env`: it holds the App's private key.

**Retention.** The worker deletes stored item text and the exact text sent to the decision backend after `RETENTION_DAYS` (default 365). Decisions, actions and the audit log stay, so accuracy numbers survive.

**Upgrades.** `git pull && docker compose up -d --build`. The schema is applied on startup and only ever adds.

**Logs and health.** `make logs`, and `curl localhost:8000/api/health` returns the active backend and model.
