# GitHub Marketplace listing

Copy and checklist for listing Jev Triage on GitHub Marketplace. Field limits below come from GitHub's Marketplace docs as read in October 2026. Re-check them in the listing form before you submit.

## Read this first: a listing needs a hosted instance

Marketplace requires the app to be publicly available, and only org owners can submit an org-owned app. The self-host flow in this repo creates a separate GitHub App per self-hoster, which cannot be listed. To list, someone has to run one public instance that anyone can install. That means:

- You process other people's issue text. You need a real privacy policy and a support channel.
- Model calls cost money. Decide who pays before you promise a free plan.
- Paid plans need a verified publisher org and, per GitHub, a minimum of 100 installations for a GitHub App. Launch free-only.

If you are not ready to host, skip the listing. Self-hosters can still find the project through the repo, site and lists in [positioning.md](positioning.md). Reuse the very short description below as the description in the app manifest so the public app page reads the same.

## Listing fields

| Field | Limit (from GitHub docs) | Value |
|---|---|---|
| Listing name | 255 chars, must be unique, cannot match another GitHub account name unless it is yours | Jev Triage |
| Very short description | 40 to 80 chars recommended, no end punctuation, no call to action | Triage bot that measures itself on your history before it acts |
| Introductory description | 150 to 250 chars recommended, begin with the app name | Jev Triage labels, routes and checks issues and pull requests. It starts in shadow mode, shows its confidence, is measured against your repo's own history before it acts, and never closes anything. |
| Detailed description | 1,000 chars max, 3 to 5 value propositions, each with a level-3 title | See below (796 chars) |
| Primary category | required | Open Source management |
| Secondary category | optional | Project management |
| Supported languages | optional, up to 10 | Leave empty. It works on any repo, whatever the language |
| Customer support URL | required | `https://github.com/YOUR-ORG/jev-triage/issues` or a Discussions URL |
| Privacy policy URL | required | `https://YOUR-DOMAIN/privacy` (TODO: write and host it; outline below) |
| Documentation URL | optional | `https://github.com/YOUR-ORG/jev-triage/tree/main/docs` |
| Company URL | optional | `https://github.com/YOUR-ORG` or the project site |
| Status URL | optional | Only if you run a status page for the hosted instance |
| Setup URL (GitHub Apps) | after install | The dashboard URL of the hosted instance |

Category names were read from the Marketplace sidebar. Fallbacks if "Open Source management" is not offered when you submit: "Utilities" or "Code review" as primary.

### Detailed description (paste as Markdown)

```markdown
### Decides, does not chat
Each issue and PR gets typed questions: type, repro steps, version, breaking change, owner. Answers map to fixed actions. Comments are off unless you turn them on.

### Shadow mode first
Every feature records what it would do and queues it for review. Nothing changes on GitHub until you set a feature to auto.

### Measured on your history
Replay closed issues and merged PRs, see accuracy and calibration per question, and let it act only where measured accuracy clears your threshold.

### Never closes anything
No closing, deleting, locking or transfers. Duplicate links and transfers are suggestions you accept.

### Config in your repo
Settings live in .github/jev-triage.yml. Apache-2.0, self-hostable. Jev is a model by TypeSafe AI; this project is independent.
```

## Feature bullets (for the repo, site and any longer copy field)

- Typed questions per issue: bug, feature, question or docs; reproduction steps; version; logs.
- PR checks against your contributing rules, plus exact checks in code: tests, docs, diff size, CODEOWNERS. Reported as a neutral check run.
- Routing by repo and area, with owners from your YAML.
- Inbound report gate for low-quality and duplicate reports. Security-looking outside reports are held, never filed publicly.
- CI gate: classifies failures as code bug, flaky test or infrastructure, links to an existing issue, caps new issues per hour.
- Confidence on every decision, calibration view, recommended thresholds.
- Dashboard with a review queue, per-decision override, audit log.
- Model pinned to `jev-1.13.0`, with the version stored on every run.

## Permissions to explain on the listing

Marketplace shows the app's permissions. Be ready to justify each one in the description or docs:

| Permission | Why |
|---|---|
| Issues: read and write | Read new issues, apply labels, assign owners |
| Pull requests: read and write | Read PRs and changed files, apply labels |
| Checks: read and write | Post one neutral "Jev Triage" check run per commit |
| Contents: read | Read `.github/jev-triage.yml` and the contributing rules file |
| Metadata: read | Required by GitHub |

There is no contents write. Events: `installation`, `installation_repositories`, `issues`, `pull_request`, `push`.

TODO before submitting: GitHub's requirements say listings must set up webhook events for plan changes and cancellations through the Marketplace API. The app does not subscribe to `marketplace_purchase` today. Check whether a free-only listing still has to, and if so add the event to the hosted app and handle it. The manifest is owned by the infra files, not this doc.

## Screenshots to capture

Up to 5 images, at least 1,200 px wide, all the same aspect ratio (16:10 works). Use a real public repo you control with real data. Do not mock numbers. Crop out personal data.

1. Review queue: items with suggested answers, confidence and threshold visible.
2. Evaluation view: accuracy per question with the "upper bound" note, and the calibration chart.
3. Repo overview: feature modes (`shadow` and `auto`) and `acted_share`, `accuracy`, `override_rate`.
4. Item detail: the exact text sent, each decision with probability, the actions taken, the override control.
5. Config view: the YAML and the link to GitHub's web editor.

Spare shots: CI reports with the matched candidate issue, and the flaky-test list.

## Visual assets

| Asset | Spec | Notes |
|---|---|---|
| Logo | 200 x 200 px minimum, square, transparent background, avoid text | The check mark from `site/og.svg` on a blue square works |
| Badge background color | hex | `#2563eb` to match the logo |
| Feature card image | 965 x 482 px | Pattern or texture, no screenshots. Pick an app-name text color that clears contrast |
| Social preview (repo) | 1280 x 640 px recommended by GitHub | `site/og.png` is 1200 x 630. Re-export at 1280 x 640 for the repo setting if you want an exact fit |

## Pricing

One plan.

- **Free.** Public repositories, all features, shadow and auto modes. Self-hosting is free for any repo.
- Private repositories: decide before launch whether the hosted instance accepts them. The app already keeps private repos disabled until an admin acknowledges that content goes to the decision backend.
- No paid plan at launch. Paid plans need a verified publisher org and the install minimum noted above.

## Privacy policy outline (TODO: write it, host it, then paste the URL)

State plainly:

- What is processed: issue and PR titles and bodies (truncated), contributing rules, repo facts, changed file list. Current labels are not sent.
- Where it goes: the decision backend (TypeSafe AI's Jev API by default; Anthropic's API if the fallback is on). Name them as sub-processors.
- What is stored: decisions, actions, audit log, and the exact text sent. The text is purged after the retention window (`RETENTION_DAYS`, default 365).
- No reporter-history profiling.
- Deletion: uninstalling the app deletes the org's stored data.
- Contact for privacy requests.

Have a lawyer read it if the instance will serve orgs you do not know.

## Submission checklist

- [ ] Hosted instance is up, public, and installable
- [ ] Org owner submits (GitHub App manager role is not enough)
- [ ] Privacy policy and support URLs resolve
- [ ] Logo, feature card and screenshots uploaded
- [ ] Marketplace Developer Agreement accepted
- [ ] Free plan created
- [ ] `marketplace_purchase` handling decided (see TODO above)
- [ ] Listing text matches what the product does today
