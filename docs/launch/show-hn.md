# Show HN draft

Written in the first person for the project author. Edit any line that is not true of you (for example, that you maintain projects) before posting.

Post on a Tuesday to Thursday. Link to the GitHub repo. Post the first comment yourself, right away. Stay for several hours. Do not ask anyone to upvote. Follow the current Show HN guidelines.

## Title (80 characters max)

Primary (78):

```
Show HN: A GitHub issue triage bot that starts in shadow mode and never closes
```

Alternatives:

```
Show HN: OSS Inbox, a GitHub triage bot that measures itself first
Show HN: OSS Inbox, open-source triage that proves itself on your history
```

URL: `https://github.com/DibbayajyotiRoy/oss-inbox`

## First comment

```
I maintain open-source projects, and triage is the part of the job that eats the week:
labeling, asking for missing info, checking PRs against CONTRIBUTING, routing. Lately
it also means reading bug and security reports that cite functions that do not exist,
and CI agents that file the same failure over and over. curl ended its bug bounty and
Google stopped taking product reports in its OSS VRP, both because of floods of
automated submissions. Most projects cannot do that.

OSS Inbox is a self-hosted GitHub App plus a dashboard. It does not chat. For each
issue or PR it asks typed questions (what kind of issue is this, are there repro
steps, does this PR follow our rules, which area owns it, is this CI failure the same
as an open issue) and maps each answer to a fixed action, like a label or an assignee.

Three design choices:

1. Every answer has a confidence, and it only acts above a threshold you set.
2. Before it acts on a question, it has to be measured on your own history. The
   backfill replays closed issues and merged PRs and shows accuracy and calibration
   per question. Default is at least 30 labeled samples at or above the threshold.
3. It starts in shadow mode. It records what it would do and puts the item in a
   review queue. It never closes, deletes, locks or transfers anything, comments are
   off unless you turn them on, and the app has no write access to repo contents.

Config is a YAML file in your repo. A bad config falls back to defaults that never act.
Issue text is treated as untrusted: actions are fixed code paths per answer.

The decision backend is TypeSafe AI's Jev model, pinned to jev-1.13.0. There is an
Anthropic Claude fallback that is marked uncalibrated. I am not affiliated with
TypeSafe AI. It is Apache-2.0, Docker Compose, Postgres and Redis.

Limits you should know about:
- You need an API key from TypeSafe (or Anthropic for the fallback). There is no
  local-model mode.
- Backfill accuracy is an upper bound: only items your maintainers labeled count.
- Repos that never used labels have little ground truth, so questions stay in the
  queue until your accept/override decisions build it up.
- I have no third-party accuracy numbers to show yet. [Replace with real, consented
  numbers if you have them. Otherwise leave this line.]

What I would like to hear: which questions you would want that are missing, and what
would make you trust it enough to turn on auto for one feature.
```

## Questions to expect, and honest answers

**Why not a prompt in a GitHub Action?**
For one small repo, do that. It is less to run. What it does not give you is a probability you can check, a measured accuracy on your history, a review queue, or a way to turn the same thing on across many repos with shared defaults.

**Is this more AI slop?**
It does not write at people. It answers typed questions and runs fixed actions. By default it posts nothing.

**What about prompt injection?**
A report can influence an answer. It cannot add an action the code does not have, and there is no code path that closes, deletes, locks or transfers. Shadow mode and measured accuracy are there for the wrong-answer case.

**You send my issues to a third party.**
Yes, to the decision backend. The FAQ lists exactly what is sent. Current labels are not. Private repos are off until an admin acknowledges it. Stored text is purged after the retention window. There is no local-model mode today.

**Who is TypeSafe AI? Is Jev real?**
Jev is a model by TypeSafe AI with a public API ([docs.typesafe.ai](https://docs.typesafe.ai)). I do not work for them and the project is independent. If you do not want to depend on it, the backend is a small interface and the Claude fallback is there, with the uncalibrated caveat.

**What accuracy does it get?**
I will not quote a number from someone else's repo. Run the backfill on yours. The tool prints the number and says it is an upper bound.

**Does it detect AI-written reports?**
No, and it never claims a report was AI-written. It asks if a report is reproducible, grounded in your repo, supported by evidence and not a duplicate.

**Why self-hosted only?**
Because it holds issue text and a GitHub App key, and I would rather you own both. A hosted instance only exists if someone runs one.
