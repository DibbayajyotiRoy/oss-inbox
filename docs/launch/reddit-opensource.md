# Reddit drafts

Written in the first person for the project author. Edit any line that is not true of you (for example, that you maintain projects) before posting.

Before posting: read each subreddit's current rules on self-promotion and project posts. Some require a flair, a minimum account age, or an approval. Disclose that you built it. One subreddit per day, and a different angle each time. Do not post links in comments unless asked.

## r/opensource

Title:

```
I built a triage bot for maintainers that has to prove itself on your repo before it can act
```

Body:

```
I maintain open-source projects and I got tired of the triage loop: label, ask for
repro steps, check the PR against CONTRIBUTING, route to the right area. Now there are
also AI-generated reports and CI agents that file the same failure five times.

I wrote an open-source GitHub App to take the repetitive part. Disclosure: I am the
author. It is called OSS Inbox, Apache-2.0, self-hosted.

How it differs from the bots I tried:

- It does not chat. It answers typed questions about each issue or PR and runs fixed
  actions (label, assign, neutral check run).
- Each answer has a confidence. It acts only above a threshold you set.
- It has to be measured on your own closed issues and merged PRs before it may act on a
  question.
- It starts in shadow mode: records and queues, changes nothing. It never closes,
  deletes, locks or transfers anything, and comments are off by default.

Limits: it needs an API key for the decision backend (TypeSafe AI's Jev model, or an
Anthropic fallback that is marked uncalibrated), it is self-hosted with Docker Compose,
and backfill accuracy is an upper bound.

Repo: https://github.com/DibbayajyotiRoy/oss-inbox

Question for other maintainers: what is the one triage task you would trust a bot with,
and what would it have to show you first?
```

## r/github

Different angle: the problem and the config, not the pitch. Check that the sub allows project posts.

Title:

```
Config-as-YAML triage for a GitHub App: shadow mode first, thresholds per question. Feedback wanted
```

Body:

```
I built a GitHub App (I am the author, Apache-2.0, self-hosted) for issue and PR triage
and I want feedback on the config design from people who maintain repos.

The whole config is one file in the repo, .github/oss-inbox.yml, with org defaults in
ORG/.github:

  features:
    issue_triage: { mode: auto }     # off | shadow | auto, default shadow
  comments: false
  thresholds:
    issue.type: 0.90
  evaluation:
    require_evaluation: true
    min_samples: 30

The dashboard never writes to your repo. It shows the YAML and a link to GitHub's web
editor, so changes go through your normal review. The app has Issues, PRs and Checks
read/write, Contents read only.

Is that the right split? Would you want the app to open a PR with config changes
instead? What would you want a first-run check to tell you?

https://github.com/DibbayajyotiRoy/oss-inbox
```

## Replies to prepare

- "Does it detect AI-written text?" No. It asks whether a report is actionable and never claims text was AI-written.
- "What does it send to a model?" Point to the FAQ section on data sent.
- "Why not Dosu or a prompt in an Action?" Point to [comparison.md](../comparison.md). Say what those are good at.
- "Is this affiliated with TypeSafe?" No. Jev is their model, this project is independent.
