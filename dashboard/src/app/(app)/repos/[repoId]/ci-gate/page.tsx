"use client";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useState } from "react";
import { ConnectCi } from "@/components/ci/connect-ci";
import { CiSkeleton } from "@/components/ci/ci-skeleton";
import { outcomeMeta } from "@/components/ci/outcome";
import { groupReports, ReportGroup } from "@/components/ci/report-group";
import { ReportRow } from "@/components/ci/report-row";
import { useRepo } from "@/components/repo";
import { Button } from "@/components/ui/button";
import { CardSection } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Load, LoadMore } from "@/components/ui/load";
import { PageHeader } from "@/components/ui/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { repoPath } from "@/lib/fmt";
import type { CiOutcome, CiReport } from "@/lib/types";
import { usePaged } from "@/lib/use-api";

// Recharts (~440 KB) loads after first paint; the skeleton is the chart's exact size, so nothing shifts.
const OutcomeBar = dynamic(() => import("@/components/ci/outcome-bar").then((m) => m.OutcomeBar), {
  ssr: false,
  loading: () => <Skeleton className="h-28 sm:h-20" />,
});

export default function CiGate() {
  const { repo } = useRepo();
  const list = usePaged<CiReport>(`/api/repos/${repo.id}/ci-reports?limit=50`);
  const [only, setOnly] = useState<CiOutcome | null>(null);
  return (
    <>
      <PageHeader
        title="CI failures"
        description="What Jev did with each CI failure."
        actions={
          <Button asChild variant="outline" size="sm">
            <Link href={repoPath(repo.id, "settings")}>Tokens</Link>
          </Button>
        }
      />
      <Load res={list} fallback={<CiSkeleton />} isEmpty={(d) => d.length === 0} empty={<ConnectCi repoId={repo.id} fullName={repo.full_name} />}>
        {(reports) => {
          const shown = only ? reports.filter((r) => r.outcome === only) : reports;
          return (
            <div className="flex flex-col gap-6">
              <CardSection
                title="What Jev did"
                description={
                  only
                    ? `Showing ${shown.length} of ${reports.length}. Pick ${outcomeMeta(only).label.toLowerCase()} again to clear.`
                    : `${list.more ? "Newest " : ""}${reports.length} ${reports.length === 1 ? "report" : "reports"}${list.more ? ", more below" : ""}. Pick one to filter.`
                }
              >
                <OutcomeBar reports={reports} onSelect={setOnly} />
              </CardSection>
              {shown.length === 0 ? (
                <EmptyState
                  art="inbox"
                  title="No matching reports"
                  description={list.more ? "Load more to look further back." : "None in the reports shown."}
                />
              ) : (
                <ul className="divide-y overflow-hidden rounded-xl border bg-card shadow-sm" aria-label="CI failure reports">
                  {groupReports(shown).map(({ key, reports: rs }) =>
                    rs.length === 1 ? (
                      <ReportRow key={key} r={rs[0]} repoId={repo.id} fullName={repo.full_name} />
                    ) : (
                      <ReportGroup key={key} test={key} reports={rs} repoId={repo.id} fullName={repo.full_name} />
                    ),
                  )}
                </ul>
              )}
              <LoadMore list={list} />
            </div>
          );
        }}
      </Load>
    </>
  );
}
