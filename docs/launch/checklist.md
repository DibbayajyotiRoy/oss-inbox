# Launch checklist

A 30-day plan to make OSS Inbox findable by the maintainers it is for. Strategy and rationale: [../positioning.md](../positioning.md). The copy for each post is in this folder.

`YOUR-ORG` is the GitHub org that will host the repo. It appears in the README, site and docs.

## TODO before anything goes public

- TODO: choose the GitHub org and repo name, then replace the placeholder everywhere:
  ```bash
  grep -rl YOUR-ORG . --exclude-dir=.git --exclude-dir=node_modules | xargs sed -i 's/YOUR-ORG/DibbayajyotiRoy/g'
  ```
- TODO: choose the site address. If you use a custom domain instead of `dibbayajyotiroy.github.io/oss-inbox/`:
  ```bash
  sed -i 's|https://dibbayajyotiroy.github.io/oss-inbox/|https://triage.example.com/|g' site/index.html site/sitemap.xml site/robots.txt
  ```
- TODO: confirm the CI badge in `README.md` points at the real workflow file (`.github/workflows/ci.yml` exists today).
- TODO: confirm `LICENSE` names the right copyright holder.
- TODO: confirm `SECURITY.md` has a working private reporting address. Use a project address, not a personal one.
- TODO: verify every claim about other tools in `docs/comparison.md` against their current docs, and drop any you cannot confirm. Three claims from early research are deliberately not cited anywhere because they were not verified: that Dosu can be loud when it is wrong, that dosu-cli issue #151 describes hidden agent-directed HTML in comments, and that GitHub agentic workflows issue #52376 describes a runtime failure on missing labels. Check each one yourself before anyone quotes it.
- TODO: record a 60 to 90 second screen capture: item arrives, shadow decision with confidence, queue, override, accuracy updating. Show HN works better with a way to see it without a setup.
- TODO: capture the screenshots listed in [../marketplace-listing.md](../marketplace-listing.md) from a real repo you control.
- TODO: make a logo (square, 200 px minimum, transparent) and a 1280 x 640 social preview. `site/og.svg` is the starting point; `site/og.png` is rendered from it.
- TODO: decide whether anyone will run a hosted instance. If not, skip the Marketplace listing.
- TODO: write the privacy policy if you list on Marketplace.
- TODO: turn on GitHub Discussions and write a pinned "Start here" post.
- TODO: set up one project email address for outreach replies.

## Repo metadata

Description (164 characters, GitHub allows 350):

```
Open-source GitHub App for issue and PR triage. Labels, routes and screens reports, shows confidence, runs in shadow mode first, never closes anything. Self-hosted.
```

Topics (20, the maximum; lowercase letters, numbers and hyphens, 50 characters each):

```
github-app  github-bot  issue-triage  triage-bot  issue-labeler  auto-label
duplicate-detection  maintainer-tools  open-source  pull-requests  codeowners
flaky-tests  llm  self-hosted  fastapi  nextjs  docker-compose  bug-reports
devtools  github-issues
```

One command sets the description, homepage and topics:

```bash
gh repo edit DibbayajyotiRoy/oss-inbox \
  --description "Open-source GitHub App for issue and PR triage. Labels, routes and screens reports, shows confidence, runs in shadow mode first, never closes anything. Self-hosted." \
  --homepage "https://dibbayajyotiroy.github.io/oss-inbox/" \
  --add-topic github-app,github-bot,issue-triage,triage-bot,issue-labeler,auto-label,duplicate-detection,maintainer-tools,open-source,pull-requests,codeowners,flaky-tests,llm,self-hosted,fastapi,nextjs,docker-compose,bug-reports,devtools,github-issues
```

The social preview image cannot be set from the CLI. Upload it in Settings, General, Social preview.

## Deploy the site without a workflow

`site/` is plain HTML and CSS with no build step.

**GitHub Pages from a branch.** Pages can serve the repo root or `/docs`, not `/site`, so publish the folder to its own branch:

```bash
git subtree push --prefix site origin gh-pages
```

Then Settings, Pages, Source: Deploy from a branch, Branch: `gh-pages`, folder `/ (root)`. Run the same command to update.

**Cloudflare Pages or Netlify.** Connect the repo, leave the build command empty, set the output directory to `site`.

After deploying:

- Crawlers read `/robots.txt` and `/sitemap.xml` only at the root of a host. On `dibbayajyotiroy.github.io/oss-inbox/` those two files are ignored. Use a custom domain or an org site at `dibbayajyotiroy.github.io`, or submit the sitemap by hand in Google Search Console and Bing Webmaster Tools.
- Social cards need a PNG. `site/og.png` is referenced by the meta tags. If you change `site/og.svg`, re-render it:
  ```bash
  google-chrome --headless --window-size=1200,630 --screenshot=site/og.png site/og.svg
  ```
- Check the preview in the Open Graph and Twitter card debuggers, and run a Lighthouse pass. There is no JavaScript, so it should be quick.

## 30 days

Launch day is day 15. Pick a Tuesday, Wednesday or Thursday.

### Week 1: make it findable

- [ ] Day 1: Replace `YOUR-ORG`. Push. Set description, topics, homepage, social preview.
- [ ] Day 1: Follow the README quickstart on a clean machine. Time it. Fix anything that is wrong or slow.
- [ ] Day 2: Deploy the site. Submit the sitemap. Check the share previews.
- [ ] Day 3: Install the app on this repo in `shadow` mode. Keep `.github/oss-inbox.yml` public.
- [ ] Day 4: Capture screenshots and the screen recording.
- [ ] Day 5: Enable Discussions. Pin "Start here: try it in shadow mode". Add `good first issue` and `help wanted` labels and 5 to 10 real starter issues.
- [ ] Days 6 to 7: Read the rules of every channel you plan to use (subreddits, Lobsters, awesome lists). Fill the real URLs into the drafts in this folder.

### Week 2: make it credible

- [ ] Days 8 to 10: Find 3 to 5 projects that agree to a read-only trial: they install the app in shadow mode or self-host it, run the backfill, and look at their own calibration. You do not need access to their repos.
- [ ] Day 10: With their permission, collect numbers. If nobody agrees, say in the launch post that there is no third-party data yet. Do not invent any.
- [ ] Day 11: Ask two maintainers who have not seen it to read the README cold. Can they say what it does in 30 seconds? Rewrite whatever they could not.
- [ ] Day 12: Fix the top two onboarding problems they hit.
- [ ] Day 13: Prepare the awesome-list PRs ([awesome-list-pr.md](awesome-list-pr.md)). Check each list's maturity rules before submitting.
- [ ] Day 14: Final pass on the Show HN text, the FAQ, and the issue templates. Test the "setup failed" path.

### Week 3: announce

- [ ] Day 15: Show HN ([show-hn.md](show-hn.md)). Be present for several hours and answer everything.
- [ ] Day 15: Publish the launch post on your own site, then dev.to and Hashnode with the canonical URL pointing at your own ([blog-post.md](blog-post.md)).
- [ ] Day 16: r/opensource ([reddit-opensource.md](reddit-opensource.md)).
- [ ] Day 17: r/github, a different day and a different angle. Add a substantive reply to one existing GitHub Community thread about triage or maintainer load.
- [ ] Day 18: Lobsters, if you have an invite. Post the technical write-up on calibration, not the product page.
- [ ] Day 19: Submit to The Changelog (news) and console.dev (tools).
- [ ] Days 20 to 21: Open the awesome-list PRs, one list at a time.

### Week 4: listen

- [ ] Day 22: Answer every launch issue and discussion. Label them (with the app itself, in shadow mode, so you see how it does).
- [ ] Day 23: Add each repeated question to `docs/faq.md`. Add each repeated objection to the objections in `docs/positioning.md`.
- [ ] Days 24 to 26: Outreach, at most 5 emails this week ([outreach-email.md](outreach-email.md)).
- [ ] Day 27: Publish one follow-up: what people asked, or a technical post on measuring a triage bot.
- [ ] Day 28: Look up the current dates for GitHub's Maintainer Month (May) and for FOSDEM and All Things Open CFPs. Calendar them.
- [ ] Day 29: Review the metrics below. Choose one thing to improve.
- [ ] Day 30: Retro. Decide on a hosted instance and the Marketplace listing.

## Metrics to track weekly

Stars are not on this list. Keep a simple sheet.

| Metric | Source |
|---|---|
| Quickstart completions and "setup failed" issues | Issues, Discussions |
| Repos in `auto` mode for at least one feature | Reports from adopters, dashboards you run |
| Override rate per week and accuracy with `n` per question | Dashboard, with adopters' consent |
| Acted share versus queued | Dashboard |
| Outreach replies that became trials | Your tracker |
| Site visits, referrers | Privacy-friendly analytics if you add any, GitHub traffic page |
| Installs of the hosted app | Marketplace insights, only if listed |

Self-hosted instances send nothing back. Do not add telemetry to get these numbers. Ask.

## Rules while launching

- Answer the same day. Be plain about what it does not do.
- Never ask for upvotes or stars. Never use alt accounts.
- Disclose that you built it in every post.
- Do not post the same text to two places on the same day.
