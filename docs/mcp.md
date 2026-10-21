# Use OSS Inbox from your AI agent (MCP)

OSS Inbox exposes an [MCP](https://modelcontextprotocol.io) endpoint so an agent in Claude Code, Cursor or VS Code can read your triage queue, check measured accuracy, try a threshold and resolve items. The agent works under the same rules as a person in the dashboard.

Use it for things like: "what is waiting in the review queue and why", "which questions are measured well enough to go to `auto`", "what would 0.85 do on `issue.type`", "accept the suggestions on the held items I just read".

| | URL |
|---|---|
| Public demo (read-only, no token) | `https://oss.dibbayajyoti.com/api/mcp` |
| Your instance | `<your dashboard url>/api/mcp`, for example `http://localhost:3000/api/mcp` |

## Try it on the demo

The public demo allows anonymous, read-only MCP access to its sample org (`demo-org`). No token, nothing touches GitHub, data resets nightly.

```bash
claude mcp add --transport http oss-inbox-demo https://oss.dibbayajyoti.com/api/mcp
```

Then ask: "List the repos on oss-inbox-demo, show the review queue for demo-org/api, and tell me which questions are below their threshold."

Write tools (`resolve_item`, `submit_report`) are refused on the demo.

## Connect to your instance

Create a token first (next section), then export it and add the server. Replace the URL with your own.

### Claude Code

```bash
export OSS_INBOX_TOKEN=...   # from Settings > Agents & MCP
claude mcp add --transport http oss-inbox https://oss.dibbayajyoti.com/api/mcp \
  --header "Authorization: Bearer $OSS_INBOX_TOKEN"
```

### Cursor

`.cursor/mcp.json` (or `~/.cursor/mcp.json`):

```json
{
  "mcpServers": {
    "oss-inbox": {
      "url": "https://oss.dibbayajyoti.com/api/mcp",
      "headers": { "Authorization": "Bearer ${env:OSS_INBOX_TOKEN}" }
    }
  }
}
```

### VS Code

`.vscode/mcp.json`. VS Code prompts for the token once and keeps it out of the file:

```json
{
  "inputs": [
    { "type": "promptString", "id": "oss-inbox-token", "description": "OSS Inbox agent token", "password": true }
  ],
  "servers": {
    "oss-inbox": {
      "type": "http",
      "url": "https://oss.dibbayajyoti.com/api/mcp",
      "headers": { "Authorization": "Bearer ${input:oss-inbox-token}" }
    }
  }
}
```

Any other MCP client that speaks streamable HTTP works the same way: URL plus an `Authorization: Bearer <token>` header.

## Tokens and scopes

Create tokens in the dashboard under **Settings > Agents & MCP**.

- **Repo-scoped.** A token works on the repos you pick, and nowhere else.
- **Read.** The five read tools. Cannot change anything.
- **Write.** Everything in read, plus `resolve_item` and `submit_report`. Create these only for agents you trust to act, and only on the repos they need.
- Copy the token when it is shown. Revoke it in the same screen, and the agent loses access at once.
- Keep tokens out of git. Use an environment variable or your client's secret prompt, as in the examples above.

## Tools

Your client lists the exact argument schema (`tools/list`). In one line each:

| Tool | Scope | What it does |
|---|---|---|
| `list_repos` | read | The repos the token can see, with feature modes and open queue counts. |
| `list_queue` | read | A repo's review or held queue: items, suggested answers, each with its confidence and threshold. |
| `get_item` | read | One item with its decisions, probabilities, actions taken, overrides and the exact text sent to the model. |
| `get_accuracy` | read | Per question: samples, measured accuracy, calibration error, recommended threshold, and whether it is measured enough to act. |
| `preview_threshold` | read | What-if: for a question and a threshold, how many past decisions would act and how many of those would be wrong. Changes nothing. |
| `resolve_item` | write | Accept, dismiss or release a queue entry, optionally with corrected answers. Same effect as the dashboard button. |
| `submit_report` | write | Post a CI or external report to the gate, like `POST /api/v1/reports`. Outcome is `filed`, `merged`, `flaky`, `infra`, `queued`, `rate_limited` or `held`. |

## Safety rules

- **Same rules as a human.** Agents get no extra powers. Thresholds, per-feature modes (`off`, `shadow`, `auto`) and the "measured before auto" check all apply.
- **Dry-run applies.** With `DRY_RUN=true`, a write only records what would have happened. Nothing reaches GitHub.
- **Everything is audited.** Agent writes land in the same audit log as dashboard actions.
- **Write needs a write token.** A read token cannot resolve or submit anything, and a token cannot reach a repo it was not scoped to.
- **Nothing ever closes issues.** No tool closes, deletes, locks or transfers anything, because the app has no such code path. Transfers and duplicate links stay suggestions.
- **Config stays in your repo.** There is no tool that edits `.github/oss-inbox.yml`. Threshold changes go through a pull request, as for a human.
- **Item text is untrusted.** Results include text written by strangers. Tell your agent to treat it as data and not as instructions. The server never acts on it.

A good first prompt for an agent with a write token: "Read the held queue for OWNER/REPO. Summarize each item and your recommended answer. Do not resolve anything until I say so."

## Self-hosting

The MCP endpoint is part of the API and is served at the dashboard's `/api/mcp` path, so there is nothing extra to run. Open **Settings > Agents & MCP** in your dashboard, create a token, and use your dashboard URL in the examples above. See [self-hosting.md](self-hosting.md) and [configuration.md](configuration.md#modes).

## See also

- [FAQ: Can my agent use it?](faq.md#can-my-agent-use-it)
- [FAQ: Why a calibrated model instead of an LLM?](faq.md#why-a-calibrated-model-instead-of-an-llm)
- [CI gate](ci-gate.md), the HTTP route behind `submit_report`
