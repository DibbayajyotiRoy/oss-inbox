# GitHub App

OSS Inbox is a GitHub App you own and host. The quick way to create it is the manifest flow at `/api/setup` ([self-hosting.md](self-hosting.md)). This page is for creating it by hand and for reviewing what it can do.

## Create it by hand

1. Go to <https://github.com/settings/apps/new> (or `https://github.com/organizations/<org>/settings/apps/new`).
2. Fill in, using your `PUBLIC_URL` and `DASHBOARD_URL` from `.env`:

   | Field | Value |
   |---|---|
   | Homepage URL | `PUBLIC_URL` |
   | Callback URL | `DASHBOARD_URL/api/auth/callback` |
   | Request user authorization (OAuth) during installation | off |
   | Setup URL | `DASHBOARD_URL` |
   | Webhook URL | `PUBLIC_URL/api/github/webhook` |
   | Webhook secret | a random string, e.g. `openssl rand -hex 32` |
   | Where can this App be installed | Only on this account |

3. Set the permissions and events below. [`app-manifest.json`](../app-manifest.json) lists the same values.
4. Create the App, then **Generate a private key**. Put these in `.env`:

   ```bash
   GITHUB_APP_ID=...             # "App ID" on the App page
   GITHUB_APP_SLUG=...           # the name in https://github.com/apps/<slug>
   GITHUB_WEBHOOK_SECRET=...     # the secret from step 2
   GITHUB_CLIENT_ID=...          # under "Client secrets", generate one
   GITHUB_CLIENT_SECRET=...
   GITHUB_PRIVATE_KEY=...        # the .pem on one line: awk 'NF {printf "%s\\n", $0}' key.pem
   ```

5. `docker compose restart api worker`, then install the App on your repositories.

## Permissions

| Permission | Access | Why |
|---|---|---|
| Issues | Read & write | Read new issues; apply labels and assignees; file issues for CI failures. |
| Pull requests | Read & write | Read PR metadata and changed files; apply labels. |
| Checks | Read & write | Post one neutral "OSS Inbox" check per commit. It never fails or blocks a merge. |
| Contents | Read | Read `.github/oss-inbox.yml`, your contributing rules, the file tree and CODEOWNERS. The App cannot push code or edit files. |
| Metadata | Read | Required by GitHub for every App. |

Comments are posted only if a repo sets `comments: true`. OSS Inbox never closes, deletes, locks or transfers issues or PRs.

## Events

| Event | Used for |
|---|---|
| `installation`, `installation_repositories` | Always delivered. Track which orgs and repos the App can see. Removing the App deletes that org's data from your database. |
| `issues` | Triage new and edited issues. |
| `pull_request` | Check new and updated PRs. |
| `push` | Reload config and rules when they change. |

## What leaves your server

- To GitHub: the API calls above.
- To the decision backend, once per item: its title and body (body truncated to 6000 characters), plus what the enabled features need:
  - PRs: changed file names with line counts, and the first 4000 characters of the diff;
  - PR checks: your contributing rules (truncated to 4000);
  - inbound gate: whether the file paths an issue mentions exist in the repo, and the text of up to 5 similar issues (for duplicate checks);
  - routing: area names and descriptions from your config, and your org's repository names and descriptions;
  - CI reports: the failure title, body, failing test and the first 3000 characters of the log excerpt you submit.

  Never the item's current labels and never information about the author's history.
- The backend is TypeSafe's Jev API (`JEV_BASE_URL`) by default, or Anthropic if you set `DECISION_BACKEND=anthropic`. Nothing else leaves your server, apart from the optional Slack-compatible `ci_gate.notify_webhook_url`.

## Private repositories

Public repositories are enabled when the App is installed. Private repositories are installed **disabled**, because their issue and PR text would be sent to the decision backend. A repo admin enables one in the dashboard and must acknowledge that explicitly; the acknowledgement is recorded in the audit log.
