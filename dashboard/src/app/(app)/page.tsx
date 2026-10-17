"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useMe } from "@/components/shell";
import { Empty } from "@/components/ui";

const slug = process.env.NEXT_PUBLIC_GITHUB_APP_SLUG;

export default function Home() {
  const me = useMe();
  const router = useRouter();
  const only = me.orgs.length === 1 ? me.orgs[0].id : null;
  useEffect(() => {
    if (only !== null) router.replace(`/orgs/${only}`);
  }, [only, router]);

  if (only !== null) return <p className="py-8 text-center text-muted" role="status">Opening your organization…</p>;
  if (me.orgs.length === 0)
    return (
      <Empty title="No organizations yet">
        Jev Triage only shows organizations where its GitHub App is installed and where you have access. Install the app on your
        organization or account{" "}
        {slug ? <a href={`https://github.com/apps/${slug}/installations/new`}>(install the GitHub App)</a> : "from the app's GitHub page"}, select
        the repositories to triage, then reload this page. Self-hosting? See docs/github-app.md.
      </Empty>
    );
  return (
    <>
      <h1 className="mb-3 text-lg font-semibold">Choose an organization</h1>
      <ul className="grid gap-2 sm:grid-cols-2">
        {me.orgs.map((o) => (
          <li key={o.id}>
            <Link href={`/orgs/${o.id}`} className="card flex min-h-11 items-center gap-3 text-fg no-underline hover:border-muted">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={o.avatar_url} alt="" width={28} height={28} className="rounded-full" />
              <span className="font-medium">{o.login}</span>
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}
