"use client";
import { useParams } from "next/navigation";
import { InstallLink } from "@/components/overview/install-link";
import { OrgStats } from "@/components/overview/org-stats";
import { OrgTrend } from "@/components/overview/org-trend";
import { OverviewSkeleton } from "@/components/overview/overview-skeleton";
import { OffRepoRow, OrgRepoCard } from "@/components/overview/repo-card";
import { useRepoDetails } from "@/components/overview/use-repo-details";
import { EmptyState } from "@/components/ui/empty-state";
import { Load } from "@/components/ui/load";
import { PageHeader } from "@/components/ui/page-header";
import type { Overview } from "@/lib/types";
import { useApi } from "@/lib/use-api";

export default function OrgOverview() {
  const { orgId } = useParams<{ orgId: string }>();
  const res = useApi<Overview>(`/api/orgs/${orgId}/overview`);
  return (
    <Load res={res} fallback={<OverviewSkeleton />} errorTitle="Repositories">
      {(d) => <Repos d={d} />}
    </Load>
  );
}

function Repos({ d }: { d: Overview }) {
  const { repos } = d;
  const on = repos.filter((r) => r.enabled);
  const off = repos.filter((r) => !r.enabled);
  const details = useRepoDetails(on.map((r) => r.id));
  if (repos.length === 0)
    return (
      <>
        <PageHeader title={d.org.login} />
        <EmptyState
          title="No repositories yet"
          description="Install the GitHub App on a repository to see it here."
          action={<InstallLink variant="primary" setup>Install on GitHub</InstallLink>}
        />
      </>
    );
  return (
    <div className="flex flex-col gap-10">
      <PageHeader
        className="mb-0"
        title={d.org.login}
        description={`Last 30 days across ${repos.length} ${repos.length === 1 ? "repository" : "repositories"}.`}
        actions={<InstallLink />}
      />
      <OrgStats repos={repos} details={details} />
      <OrgTrend repos={repos} />
      {on.length > 0 && (
        <section aria-labelledby="repos-h" className="flex flex-col gap-4">
          <h2 id="repos-h" className="text-lg font-semibold tracking-tight">
            Repositories
          </h2>
          <ul className="grid gap-4 md:grid-cols-2">
            {on.map((r) => (
              <li key={r.id} className="grid">
                <OrgRepoCard r={r} detail={details?.[r.id]} detailsLoading={details === undefined} />
              </li>
            ))}
          </ul>
        </section>
      )}
      {off.length > 0 && (
        <section aria-labelledby="off-h" className="flex flex-col gap-4">
          <h2 id="off-h" className="text-lg font-semibold tracking-tight">
            Not enabled
          </h2>
          <ul className="divide-y overflow-hidden rounded-xl border border-dashed">
            {off.map((r) => (
              <OffRepoRow key={r.id} r={r} />
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
