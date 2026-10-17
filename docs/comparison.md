# How Jev Triage compares

Each tool below does something useful. This page says what, and where Jev Triage is a different kind of tool. Several of them work fine alongside it.

The short version: Jev Triage **decides typed questions, shows its confidence, and proves its accuracy on your own history before it acts**. It starts silent and never closes anything.

## At a glance

| | Jev Triage | Dosu | GitHub agentic workflows / GitHub Models | DIY LLM Action | actions/labeler | Stale bot |
|---|---|---|---|---|---|---|
| Kind of tool | Decision app with dashboard | Conversational LLM agent | Prompt-based workflows on GitHub | Your own prompt in a workflow | Path-based rules | Time-based rules |
| Talks in threads | Only if you set `comments: true` | Yes, by design | If your prompt says so | If your prompt says so | No | Usually posts a notice before closing |
| Confidence per decision | Stored and shown | Not the design | None by default | Model's own claim, if any | Not applicable | Not applicable |
| Accuracy on your history before acting | Yes (backfill, calibration) | No | Only if you build it | Only if you build it | Deterministic | Deterministic |
| Starts by acting? | No. Shadow mode | Posts when enabled | Runs your prompt | Runs your prompt | Applies rules | Applies rules |
| Closes issues | Never | n/a | If the prompt does | If the prompt does | No | Yes, that is its job |
| Config | YAML in your repo | Hosted service settings | Workflow file and prompt | Workflow file and prompt | YAML in your repo | YAML in your repo |
| Hosting | Self-hosted | Hosted service | GitHub runners | GitHub runners | GitHub runners | GitHub runners or app |

## Dosu

**What it is good at.** A conversational agent for maintainers and users: it answers questions in threads using your docs and code, and helps with triage. If your main pain is repeated usage questions, an agent that answers them is the right shape. It is a hosted service, so there is nothing to run.

**Where Jev Triage differs.**

- It does not converse. It answers typed questions ("what kind of issue is this?", "are there repro steps?") and every answer maps to a fixed action. A bot that writes comments can be wrong in public. Jev Triage is silent unless you turn comments on, and every comment it posts is plain text with a link to the decision behind it.
- It shows a confidence for each answer and acts only above your threshold.
- Before it acts, it replays your closed issues and merged PRs and reports accuracy per question.
- It starts in shadow mode and never closes, deletes, locks or transfers anything.
- It is self-hosted.

**Choose Dosu** if you want answers posted to users. **Choose Jev Triage** if you want labels, routing and report screening you can measure. They can run together; watch for both applying labels to the same item.

## GitHub agentic workflows and GitHub Models

**What they are good at.** Free to start, close to your repo, and flexible. You describe a triage process in a prompt, run it on GitHub's runners, and call models through GitHub. Nothing extra to host. If you have unusual triage logic that does not fit typed questions, a prompt can express it.

**Where Jev Triage differs.**

- The prompt is yours to write, test and maintain. Jev Triage ships a fixed set of typed questions (issue type, repro steps, version, logs, breaking change, rules compliance, routing, priority, gate questions, CI classification) with default thresholds, and you tune thresholds and labels in YAML.
- A prompt returns an answer. It does not by default return a calibrated confidence, and nothing measures it on your history. Jev Triage stores the probability behind each answer and measures accuracy against what your maintainers actually decided.
- Labels named in the config are created for you if missing (label sync), and the config is validated: a typo'd key makes the app fall back to defaults that never act.
- It has a review queue and a dashboard, so overrides become ground truth and feed accuracy.

**Choose workflows** for bespoke automation where you are happy to own the prompts. **Choose Jev Triage** for the common triage questions with a measured accuracy.

## DIY LLM Actions (ai-triage style)

**What they are good at.** Thirty lines of YAML, one API key, full control, easy to read. For one small repo, this is often the right answer and a hosted dashboard would be overkill.

**Where Jev Triage differs.**

- Confidence, when a DIY Action has any, is usually what the model says about itself. Jev returns a probability for each option in its API response, the dashboard checks those against what actually happened, and the Anthropic fallback is explicitly marked uncalibrated.
- There is typically no evaluation step. Jev Triage computes accuracy and calibration on your history and recommends a threshold.
- Item text is treated as untrusted. Actions are fixed code paths per answer, so a report cannot talk the app into a different action.
- One install covers many repos with shared org defaults in `ORG/.github`.

**Choose DIY** for one or two small repos or for a quick experiment. **Choose Jev Triage** when copies of the same workflow are spreading across repos or when you need to show someone why it is safe to turn on.

## actions/labeler

**What it is good at.** Applies labels to pull requests from the paths they change. Deterministic, fast, free, official. Use it for path-based labels.

**Where Jev Triage differs.** It reads meaning, not paths: is this a bug or a question, does the report include repro steps, does the PR follow CONTRIBUTING, is this CI failure the same as an open issue. It also routes issues, which a path rule cannot do. Keep `actions/labeler` for what it does well. Jev Triage keeps exact checks (tests changed, docs changed, diff size, CODEOWNERS) in plain code too, and does not replace path rules.

## Stale bot

**What it is good at.** Housekeeping: warn about inactive issues and PRs, then close them after a period. Many projects want that.

**Where Jev Triage differs.** Different job. Jev Triage never closes anything and does no stale management. Use a stale bot if you want that policy, and Jev Triage for the decisions at the front of the queue.

## What Jev Triage is not good at yet

- It needs a decision backend: TypeSafe's Jev API, or the Anthropic fallback with uncalibrated confidence. There is no local-model mode.
- It is self-hosted: Postgres, Redis, an API, a worker and a dashboard. A hosted instance is only available if someone runs one.
- Accuracy measurement needs history. A repo that has never labeled issues has little ground truth, so questions stay in the review queue until enough maintainer answers accumulate (`evaluation.min_samples`, default 30).
- Backfill accuracy is an upper bound: only items your maintainers labeled are counted, and live traffic is messier.
- Typed questions cover common triage. They are not a general automation language.
