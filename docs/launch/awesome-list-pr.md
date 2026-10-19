# Awesome list PRs

One PR per list, one entry per PR, in the list's own format. Before each one:

- Open the list's `CONTRIBUTING.md` and PR template and follow them exactly. Formats change.
- Check that the list is still active (recent merges).
- Check maturity rules: minimum age, stars or releases. If the repo does not meet them yet, wait.
- Disclose that you are the author.
- Describe what it does in plain words. No hype words.

Lists were found by search in October 2026. Check the current repo names before you open anything.

## todogroup/awesome-ospo

Fits the OSPO secondary audience. The list has a GitHub management area. Pick the closest section.

Entry:

```markdown
- [OSS Inbox](https://github.com/DibbayajyotiRoy/oss-inbox) - Self-hosted GitHub App that labels, routes and screens issues and pull requests across many repos, with org-wide defaults and a review dashboard. Starts in shadow mode and never closes anything.
```

## fffaraz/awesome-github

A list of GitHub tools. Pick the section for apps and bots.

Entry:

```markdown
- [OSS Inbox](https://github.com/DibbayajyotiRoy/oss-inbox) - Open-source GitHub App for issue and PR triage. Shows confidence, runs in shadow mode first, and is measured on your repo's history before it acts.
```

## awesome-selfhosted/awesome-selfhosted

This list has strict rules. Submissions go through its data repository as a YAML file, and the format has changed over time, so copy the template from that repo's contributing guide, not from here. The fields below are a starting point.

```yaml
name: OSS Inbox
website_url: https://dibbayajyotiroy.github.io/oss-inbox/
source_code_url: https://github.com/DibbayajyotiRoy/oss-inbox
description: GitHub App that labels, routes and screens issues and pull requests, with a review dashboard. Starts in shadow mode, shows its confidence, never closes anything.
licenses:
  - Apache-2.0
platforms:
  - Python
  - Docker
tags:
  - Software Development - Project Management
depends_3rdparty: true
```

Notes:

- `depends_3rdparty: true` is right. It needs an external model API (TypeSafe AI's Jev, or Anthropic for the fallback), and the list marks software that depends on a third-party service.
- The description has a length limit (250 characters at last check). The text above is under it.
- Pick the closest category. "Software Development - Project Management" is a guess. Look at where similar GitHub bots sit.
- The list requires a certain amount of project history and may reject new projects. If so, wait and resubmit.

## An OSS maintainer tools list

Search GitHub for "awesome oss maintainers tools". If one is active, add this to its triage or automation section:

```markdown
- [OSS Inbox](https://github.com/DibbayajyotiRoy/oss-inbox) - Triage bot for GitHub that decides typed questions, shows its confidence, and is measured on your history before it acts. Self-hosted, Apache-2.0.
```

## PR text (adapt for each list)

Title:

```
Add OSS Inbox
```

Body:

```
Adds OSS Inbox, a self-hosted GitHub App for issue and PR triage (Apache-2.0).

- What it does: labels, routes and screens issues and PRs; checks PRs against contributing rules; groups duplicate CI failures.
- Why it fits this list: LIST-SPECIFIC REASON.
- It depends on an external model API for its decisions (documented in the README).

Disclosure: I am the author. Happy to adjust the entry, wait until the project meets the list's maturity rules, or close this if it is not a fit.
```

## Do not submit to

Lists of AI agents, chatbots or LLM apps. OSS Inbox is deliberately not a chat agent, and it will draw the wrong audience.
