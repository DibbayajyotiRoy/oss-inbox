"""python -m app.cli eval owner/repo [--limit N]   |   python -m app.cli token owner/repo NAME"""
import argparse
import hashlib
import secrets
import sys

from app import db

CAVEAT = ("Upper bound: truth is the first label a maintainer applied to closed items, so unlabeled items are excluded, "
          "later edits may leak the outcome, and live traffic is usually messier. Expect lower accuracy in production.")


def _repo(full_name: str) -> dict:
    repo = db.fetch_one("SELECT * FROM repos WHERE full_name = %s", (full_name,))
    if repo is None:
        sys.exit(f"{full_name}: unknown repo - install the GitHub App on it first")
    return repo


def _eval(args) -> int:
    from app import backfill, metrics

    repo = _repo(args.repo)
    status = None
    if args.limit != 0:  # --limit 0: just print the table from stored data
        print(f"backfilling {args.repo} (closed issues and merged PRs) ...")
        print(backfill.run(repo["id"], args.limit))
        status = db.fetch_one("SELECT backfill_status FROM repos WHERE id = %s", (repo["id"],))["backfill_status"]
    cell = lambda v, fmt: "-" if v is None else format(v, fmt)  # noqa: E731
    print(f"\n{'question':<22}{'n':>6}{'accuracy':>10}{'ECE':>8}{'threshold':>11}")
    for r in db.fetch_all("SELECT DISTINCT base_question FROM decisions WHERE repo_id = %s ORDER BY 1", (repo["id"],)):
        q = r["base_question"]
        s = metrics.question_stats(repo["id"], q)
        t = metrics.recommended_threshold(repo["id"], q)
        print(f"{q:<22}{s.n:>6}{cell(s.accuracy, '.1%'):>10}{cell(s.ece, '.3f'):>8}{cell(t, '.2f'):>11}")
    print("\nthreshold = lowest confidence cutoff with >= 10 labeled samples and <= 5% errors.\n" + CAVEAT)
    if status and status.startswith("error"):
        print(f"\nbackfill {status}", file=sys.stderr)
        return 1
    return 0


def _token(args) -> int:
    repo = _repo(args.repo)
    token = "jev_" + secrets.token_urlsafe(32)
    db.execute("INSERT INTO ci_tokens (repo_id, name, token_hash, created_by) VALUES (%s, %s, %s, 'cli')",
               (repo["id"], args.name, hashlib.sha256(token.encode()).hexdigest()))
    print(f"CI token for {args.repo} ({args.name}) - shown once, store it now:\n{token}")
    return 0


def main(argv=None) -> int:
    p = argparse.ArgumentParser(prog="python -m app.cli")
    sub = p.add_subparsers(dest="cmd", required=True)
    e = sub.add_parser("eval", help="backfill closed items and print accuracy per question")
    e.add_argument("repo", help="owner/repo, must already be installed")
    e.add_argument("--limit", type=int, help="max closed issues and max merged PRs (default BACKFILL_LIMIT each; 0 = no backfill)")
    e.set_defaults(fn=_eval)
    t = sub.add_parser("token", help="create a CI token")
    t.add_argument("repo")
    t.add_argument("name")
    t.set_defaults(fn=_token)
    args = p.parse_args(argv)
    db.init_schema()
    return args.fn(args)


if __name__ == "__main__":
    sys.exit(main())
