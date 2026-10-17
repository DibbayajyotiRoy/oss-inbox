"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { ArrowRight } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Load } from "@/components/ui/load";
import { PageHeader } from "@/components/ui/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { Status } from "@/components/ui/status";
import { Rows } from "@/components/onboarding/parts";
import { useShell } from "@/components/shell/shell-context";
import type { Me, Overview, RepoCard } from "@/lib/types";
import type { SetupStatus } from "@/lib/types-onboarding";
import { useApi } from "@/lib/use-api";

type Org = Me["orgs"][number];
const needsSetup = (r: RepoCard) => !r.enabled || r.accuracy === null;

/** Where `/` goes: no install -> setup, one org with live repos -> its repositories, otherwise a picker with "Finish setup". */
export default function Home() {
  const { me } = useShell();
  if (me.orgs.length === 0) return <NoOrgs />;
  if (me.orgs.length === 1) return <Solo org={me.orgs[0]} />;
  return (
    <>
      <PageHeader title="Choose an organization" description="Pick where to work." />
      <Rows label="Organizations">
        {me.orgs.map((o) => (
          <OrgRow key={o.id} org={o} />
        ))}
      </Rows>
    </>
  );
}

function NoOrgs() {
  const status = useApi<SetupStatus>("/api/setup/status");
  const s = status.data;
  return (
    <EmptyState
      title="No organizations yet"
      description="Install the GitHub App to see repositories here."
      action={
        s || status.error ? (
          <Button asChild>
            {s?.install_url ? (
              <a href={s.install_url} target="_blank" rel="noreferrer">
                Install the GitHub App
              </a>
            ) : (
              <Link href="/welcome">Set up Jev Triage</Link>
            )}
          </Button>
        ) : undefined
      }
    />
  );
}

/** One org: straight to its repositories once any is on; until then, the repositories to set up. */
function Solo({ org }: { org: Org }) {
  const router = useRouter();
  const { overview } = useShell();
  const live = overview?.repos.some((r) => r.enabled);
  useEffect(() => {
    if (live) router.replace(`/orgs/${org.id}`);
  }, [live, org.id, router]);

  if (!overview || live)
    return (
      <div role="status" aria-busy="true" className="flex flex-col gap-3">
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-16 w-full" />
        <span className="sr-only">Opening {org.login}</span>
      </div>
    );
  return (
    <>
      <PageHeader
        title={`Set up ${org.login}`}
        description="Pick a repository to start."
        actions={
          <Button asChild variant="ghost" size="sm">
            <Link href={`/orgs/${org.id}`}>View all repositories</Link>
          </Button>
        }
      />
      <SetupList overview={overview} />
    </>
  );
}

function SetupList({ overview }: { overview: Overview }) {
  if (overview.repos.length === 0)
    return <EmptyState title="No repositories yet" description="Add repositories to the installation on GitHub, then reload." />;
  return (
    <Rows label="Repositories">
      {overview.repos.map((r, i) => (
        <li key={r.id} className="flex items-center gap-3 px-4 py-3 text-sm">
          <span className="min-w-0 flex-1 truncate font-medium">{r.full_name}</span>
          {r.private ? <Badge variant="outline">Private</Badge> : null}
          {needsSetup(r) ? (
            <Button asChild variant={i === 0 ? "primary" : "outline"} size="sm">
              <Link href={`/onboarding/${r.id}`}>
                Finish setup
                <ArrowRight />
              </Link>
            </Button>
          ) : (
            <Button asChild variant="ghost" size="sm">
              <Link href={`/repos/${r.id}/queue`}>Open</Link>
            </Button>
          )}
        </li>
      ))}
    </Rows>
  );
}

function OrgRow({ org }: { org: Org }) {
  const res = useApi<Overview>(`/api/orgs/${org.id}/overview`);
  return (
    <li className="flex items-center gap-3 px-4 py-3 text-sm">
      <Link href={`/orgs/${org.id}`} className="flex min-w-0 flex-1 items-center gap-3 rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring">
        <Avatar className="size-7">
          <AvatarImage src={org.avatar_url} alt="" />
          <AvatarFallback>{org.login[0]?.toUpperCase()}</AvatarFallback>
        </Avatar>
        <span className="truncate font-medium">{org.login}</span>
      </Link>
      <Load res={res} fallback={<Skeleton className="h-8 w-28" />}>
        {(d) => {
          const todo = d.repos.filter(needsSetup);
          return todo.length ? (
            <>
              <span className="text-[13px] text-muted-foreground tabular-nums max-sm:hidden">
                {todo.length} of {d.repos.length} to set up
              </span>
              <Button asChild variant="outline" size="sm">
                <Link href={`/onboarding/${todo[0].id}`}>
                  Finish setup
                  <ArrowRight />
                </Link>
              </Button>
            </>
          ) : (
            <Status tone="success">{d.repos.length} {d.repos.length === 1 ? "repository" : "repositories"}</Status>
          );
        }}
      </Load>
    </li>
  );
}
