"""python -m app.cli eval owner/repo [--limit N]   |   token owner/repo NAME   |   demo (seed demo-org for DEMO_MODE=true)
   |   create-app --public-url URL --dashboard-url URL [--org ORG] [--name NAME] [--out FILE]  (no database needed)"""
import argparse
import hashlib
import html
import json
import os
import re
import secrets
import sys
import webbrowser
from http.server import BaseHTTPRequestHandler, HTTPServer
from urllib.parse import parse_qs, quote, urlparse

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


def _demo(args) -> int:
    from app import demo

    print("seeding demo-org (wipes any previous demo data) ...")
    print(", ".join(f"{n} {t}" for t, n in demo.seed().items()))
    print("Start the API with DEMO_MODE=true and open the dashboard: /api/auth/login signs you in as `demo`.")
    return 0


PORT = 8765  # also in the manifest's redirect_url


def _create_app(args) -> int:
    """Create the GitHub App from this machine (for hosts with no writable .env, e.g. Vercel). Secrets go to --out only."""
    import httpx

    from app.api.setup import env_values, manifest

    if args.org and not re.fullmatch(r"[A-Za-z0-9-]{1,39}", args.org):
        sys.exit("invalid --org")
    local = f"http://127.0.0.1:{PORT}"
    m = manifest(args.public_url.rstrip("/"), args.dashboard_url.rstrip("/"), f"{local}/callback")
    if args.name:
        m["name"] = args.name[:34]  # GitHub caps app names at 34 chars
    state = secrets.token_urlsafe(24)
    base = f"https://github.com/organizations/{args.org}/settings/apps/new" if args.org else "https://github.com/settings/apps/new"
    page = (f"<!doctype html><meta charset=utf-8><title>Create GitHub App</title><form method=post action='{html.escape(base)}"
            f"?state={state}'><input type=hidden name=manifest value='{html.escape(json.dumps(m), quote=True)}'>"
            "<button>Create GitHub App</button></form><script>document.forms[0].submit()</script>")
    result: dict = {}

    class Handler(BaseHTTPRequestHandler):
        def log_message(self, *_):  # the default logs the request line, which carries the one-time code
            pass

        def reply(self, status: int, body: str) -> None:
            self.send_response(status)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.end_headers()
            self.wfile.write(body.encode())

        def do_GET(self):
            u, q = urlparse(self.path), parse_qs(urlparse(self.path).query)
            if u.path == "/":
                return self.reply(200, page)
            if u.path != "/callback":
                return self.reply(404, "not found")
            code, got = q.get("code", [""])[0], q.get("state", [""])[0]
            if not code or not secrets.compare_digest(got.encode(), state.encode()):
                return self.reply(400, "state mismatch: ignored. Start again from the link in your terminal.")
            try:
                r = httpx.post(f"https://api.github.com/app-manifests/{quote(code, safe='')}/conversions",
                               headers={"Accept": "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28"}, timeout=20)
            except httpx.HTTPError as e:
                r = None
                result["error"] = repr(e)
            if r is not None and r.status_code != 201:
                result["error"] = f"HTTP {r.status_code}"
            if "error" in result:
                return self.reply(502, "GitHub rejected the code. See your terminal.")
            result["d"] = r.json()
            self.reply(200, "GitHub App created. You can close this tab and return to your terminal.")

    server = HTTPServer(("127.0.0.1", PORT), Handler)
    print(f"Open {local}/ in your browser (opening it for you); press Ctrl-C to abort.")
    webbrowser.open(f"{local}/")
    with server:
        while not result:
            server.handle_request()
    if "error" in result:
        print(f"GitHub did not create the app: {result['error']}. Codes are single use; run this again.", file=sys.stderr)
        return 1
    d = result["d"]
    fd = os.open(args.out, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    os.fchmod(fd, 0o600)  # O_CREAT's mode only applies to new files
    with os.fdopen(fd, "w") as f:
        f.write("".join(f"{k}={v}\n" for k, v in env_values(d).items()))
    print(f"Credentials written to {args.out} (mode 600). Install the app on your repos:\n"
          f"https://github.com/apps/{quote(d['slug'])}/installations/new")
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
    d = sub.add_parser("demo", help="seed the demo-org sample data (wipes demo-org first; use with DEMO_MODE=true)")
    d.set_defaults(fn=_demo)
    c = sub.add_parser("create-app", help="create the GitHub App from this machine and write its credentials to a file")
    c.add_argument("--public-url", required=True, help="API base URL, e.g. https://api.example.com")
    c.add_argument("--dashboard-url", required=True, help="dashboard URL, e.g. https://example.com")
    c.add_argument("--org", help="create under this organization instead of your account")
    c.add_argument("--name", help="app name (default: OSS Inbox (<host>))")
    c.add_argument("--out", default=".env.github-app", help="credentials file (default %(default)s, mode 600)")
    c.set_defaults(fn=_create_app)
    args = p.parse_args(argv)
    if args.fn is not _create_app:
        db.init_schema()
    return args.fn(args)


if __name__ == "__main__":
    sys.exit(main())
