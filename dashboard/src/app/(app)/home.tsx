"use client";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { InstallLink } from "@/components/overview/install-link";
import { useShell } from "@/components/shell/shell-context";
import type { SetupStatus } from "@/lib/types";
import { useApi } from "@/lib/use-api";

/** Shown at `/` only when there is no repository to open: `openARepo` has already sent everyone else to a repo. */
export function Home() {
  const { me } = useShell();
  return me.orgs.length === 0 ? <NoOrgs /> : <NoRepos />;
}

function NoOrgs() {
  const status = useApi<SetupStatus>("/api/setup/status");
  const s = status.data;
  return (
    <>
      <PageHeader title="Organizations" />
      <EmptyState
        title="No organizations yet"
        description="Connect GitHub to see your repositories."
        action={
          s || status.error ? (
            <Button asChild>
              {s?.install_url ? (
                <a href={s.install_url} target="_blank" rel="noreferrer">
                  Connect GitHub
                  <span className="sr-only"> (opens in a new tab)</span>
                </a>
              ) : (
                <Link href="/welcome">Set up Jev Triage</Link>
              )}
            </Button>
          ) : undefined
        }
      />
    </>
  );
}

function NoRepos() {
  return (
    <>
      <PageHeader title="Repositories" />
      <EmptyState
        title="No repositories yet"
        description="Add one on GitHub, then reload."
        action={<InstallLink variant="primary" setup>Add repositories</InstallLink>}
      />
    </>
  );
}
