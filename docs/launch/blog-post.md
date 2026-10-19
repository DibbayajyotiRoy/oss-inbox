# Launch post draft

Written in the first person for the project author. Edit anything that is not true of you. Publish on your own site first, then dev.to and Hashnode with the canonical URL pointing back. Fill in real links and, if you have them, real numbers shared with permission. If you have none, keep the sentence that says so.

Suggested slug: `a-triage-bot-that-proves-itself-first`
Meta description (under 160 characters): `Why I built an open-source GitHub triage bot that starts in shadow mode, shows its confidence, and has to be measured on your repo before it acts.`

---

# A triage bot that has to prove itself first

Triage is the part of maintaining a project that nobody sees and everybody pays for. Someone opens each new issue, works out whether it is a bug or a question, checks for reproduction steps, adds a label, asks for the version, and routes it. Someone checks each PR against CONTRIBUTING. Multiply by every repo and every week.

It is getting worse. Automated tools now write bug and security reports at scale, and many are invalid or duplicates. curl ended its bug bounty in early 2026 after a flood of them. Google stopped accepting product reports to its open-source VRP on October 1, 2026, for the same reason. Most projects cannot close the door like that, so they keep reading. CI agents add to the pile by filing the same failing test again and again.

## What I tried first

A path-based labeler is great at paths, but it cannot tell a bug from a question. A prompt in a GitHub Action can, and it is easy to start. But it gives you an answer, not a probability you can check. If it says "bug, I am 95% sure", that is the model describing itself, and nothing tells you how often it is right on your repo. Chat-style agents that reply in threads are good at answering users. I wanted the opposite: quiet decisions I could measure.

## What I built

OSS Inbox is a self-hosted GitHub App with a dashboard. For each issue or PR it asks typed questions. What kind of issue is this? Are there steps to reproduce? Does this PR follow our rules? Which area owns it? Is this CI failure the same as an open issue? Each answer is mapped to a fixed action: a label, an assignee, a neutral check run. It does not write replies unless you turn comments on.

Three things make it different.

**Every answer has a confidence.** The probability of the answer it chose, stored with the decision and shown next to it. The app acts only above a threshold you set per question.

**It has to be measured before it acts.** The backfill replays your closed issues and merged PRs and compares its answers with the labels your maintainers applied. You see accuracy and calibration per question, the worst misses, and a recommended threshold. By default a question needs at least 30 labeled samples at or above its threshold before it may act on its own. That number is an upper bound, because only items your maintainers labeled are counted and live traffic is messier. The dashboard says so.

**It starts in shadow mode.** It records what it would do and queues the item with suggested answers. Nothing is written to GitHub. When you accept or override a suggestion, your answer becomes ground truth and the measured accuracy updates. If a question drops below its threshold, it stops acting.

## What it will never do

It never closes, deletes, locks or transfers anything. Transfers and duplicate links are suggestions you accept. The app has no write access to repo contents. Comments are off by default, and when on they are plain text with a link to the decision behind them. Issue text is untrusted: each answer maps to a fixed code path, so a report cannot talk the app into a different action. Config is one YAML file in your repo, and a broken file falls back to defaults that never act.

## For the AI-report problem specifically

The inbound gate asks up to six questions about issues from outside your core team. Can a maintainer follow the steps? Does it refer to files that exist in this repo? Does it describe behavior you documented as intended? Is the claimed impact backed by evidence? Does it claim a vulnerability? Is it a duplicate? Reports that look like security issues are held and never filed publicly. This is about whether a report is actionable. It never says a report was written by an AI, and it does not profile reporters.

## Limits

You need a decision backend. The default is TypeSafe AI's Jev model, pinned to `jev-1.13.0`. Jev is theirs, and this project is independent and not affiliated with them. There is an Anthropic Claude fallback, marked uncalibrated, which I would use to try the app and not to run auto mode. There is no local-model mode. It is self-hosted with Docker Compose. A repo that never used labels has little history to measure against, so questions stay in the queue until your own decisions build it up. I have no accuracy numbers from other people's repos to show you yet. The point is that you will have your own.

## Try it

```bash
git clone https://github.com/DibbayajyotiRoy/oss-inbox.git && cd oss-inbox
cp .env.example .env
docker compose up -d --build
```

Open `http://localhost:8000/api/setup`, create the GitHub App, install it on one repo, run the backfill, and read the calibration page before you change anything to `auto`. The [self-hosting guide](https://github.com/DibbayajyotiRoy/oss-inbox/blob/main/docs/self-hosting.md) has the details.

I would like to know which questions are missing, which defaults are wrong for your repo, and what you would have to see before you trusted it with a label. Open an issue or a discussion.

OSS Inbox is Apache-2.0: https://github.com/DibbayajyotiRoy/oss-inbox
