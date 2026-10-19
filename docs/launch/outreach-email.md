# Outreach to maintainers dealing with AI-generated reports

For maintainers who have said in public that automated or low-quality reports are a problem for them. The goal is a read-only trial they run themselves, not a sale. OSS Inbox is free and open source, so there is nothing to sell.

## Rules

1. Only write to someone who has publicly described the problem (a blog post, a talk, an issue, a social post). Cite the specific thing in the first line.
2. Use a contact method the person publishes for the project: a maintainer or security contact address, or a public contact page. Never scrape addresses. Never use a personal address you guessed.
3. Send one email. Send at most one follow-up, a week later. Then stop.
4. Send no more than 5 a week, each written by hand.
5. No tracking pixels, no link shorteners, no mail-merge tools.
6. Keep a list of anyone who says no or does not reply. Never contact them again about this.
7. Do not open issues or discussions on their repo to pitch. Do not comment on their public posts with a link.
8. Do not say "AI slop" about their contributors or about specific reporters. Do not name reports.
9. Never claim results you do not have.
10. Send from a project address, say who you are, and say you are the author.

## Email

Subject: `Triage for AI-generated reports: a read-only trial, if useful`

```
Hi NAME,

I read your post about SPECIFIC THING (LINK). The part about DETAIL stuck with me,
because it is the problem I built something for.

I am the author of OSS Inbox, an open-source GitHub App (Apache-2.0, self-hosted)
that labels, routes and screens issues and PRs. It does not reply to anyone and it
never closes, deletes, locks or transfers anything. It starts in shadow mode: it
records what it would do and queues it, and writes nothing to GitHub.

The part I think may be useful to you: before it is allowed to act on any question
("is there a reproducible example?", "does this refer to files that exist in the
repo?", "is this the same as an open issue?"), it replays your closed issues and
merged PRs and shows you its accuracy and calibration per question. You decide
from your own numbers. I do not have anyone else's numbers to show you, and I would
not quote them if I did.

If you would like to try it, you run it yourself with Docker Compose and install the
GitHub App on one repo. I would not need access to anything. The setup guide is here:
LINK TO docs/self-hosting.md. It needs an API key for the decision backend (TypeSafe
AI's Jev model, which I am not affiliated with, or an Anthropic fallback that is
marked uncalibrated).

If it is not useful, no need to reply. I will not write again. If you try it and it
is wrong for your repo, I would like to hear how.

NAME
AUTHOR, OSS Inbox
PROJECT EMAIL
https://github.com/DibbayajyotiRoy/oss-inbox
```

## One-week follow-up (send once, only if they did not reply)

```
Hi NAME, one note and then I will leave you alone: if you ever want to see how a
triage bot would have scored on your closed issues without it touching anything,
the shadow-mode backfill does that. LINK. No reply needed.
```

## If they say yes

- Point them to the README quickstart and the self-hosting guide. Offer to answer setup questions in a public Discussions thread, so the answer helps the next person.
- Ask which three questions matter most to them and what accuracy they would need to see before turning on `auto` for one feature.
- Ask permission before quoting anything they say or any number from their repo. If they agree, show them the exact text first.

## If they say no, or nothing

Say thanks if they replied. Add them to the do-not-contact list.
