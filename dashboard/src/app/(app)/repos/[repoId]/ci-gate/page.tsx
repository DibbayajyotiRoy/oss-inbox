"use client";
import Link from "next/link";
import { useState } from "react";
import { ConnectCi } from "@/components/ci/connect-ci";
import { CiSkeleton } from "@/components/ci/ci-skeleton";
import { outcomeMeta } from "@/components/ci/outcome";
import { OutcomeBar } from "@/components/ci/outcome-bar";
import { ReportRow } from "@/components/ci/report-row";
import { useRepo } from "@/components/repo";
import { Button } from "@/components/ui/button";
import { CardSection } from "@/components/ui/card";
import { Load, LoadMore } from "@/components/ui/load";
import { PageHeader } from "@/components/ui/page-header";
import { repoPath } from "@/lib/fmt";
import type { CiOutcome, CiReport } from "@/lib/types";
import { usePaged } from "@/lib/use-api";

export default function CiGate() {
  const { repo } = useRepo();
  const list = usePaged<CiReport>(`/api/repos/${repo.id}/ci-reports?limit=50`);
  const [only, setOnly] = useState<CiOutcome | null>(null);
  return (
    <>
      <PageHeader
        title="CI gate"
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
                title="Outcomes"
                description={
                  only
                    ? `Showing ${shown.length} of ${reports.length}. Pick ${outcomeMeta(only).label.toLowerCase()} again to clear.`
                    : `${list.more ? "Newest " : ""}${reports.length} ${reports.length === 1 ? "report" : "reports"}${list.more ? ", more below" : ""}. Pick an outcome to filter.`
                }
              >
                <OutcomeBar reports={reports} onSelect={setOnly} />
              </CardSection>
              {shown.length === 0 ? (
                <p className="rounded-xl border border-dashed py-10 text-center text-sm text-muted-foreground">
                  No {only ? outcomeMeta(only).label.toLowerCase() : ""} reports in the loaded window.
                  {list.more && " Load more to look further back."}
                </p>
              ) : (
                <ul className="divide-y overflow-hidden rounded-xl border bg-card shadow-sm" aria-label="CI reports">
                  {shown.map((r) => (
                    <ReportRow key={r.id} r={r} repoId={repo.id} fullName={repo.full_name} />
                  ))}
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
