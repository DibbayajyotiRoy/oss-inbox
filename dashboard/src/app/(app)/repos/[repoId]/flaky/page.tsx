"use client";
import Link from "next/link";
import { FlakyList } from "@/components/ci/flaky-list";
import { useRepo } from "@/components/repo";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Load } from "@/components/ui/load";
import { PageHeader } from "@/components/ui/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { repoPath } from "@/lib/fmt";
import type { FlakyTest } from "@/lib/types";
import { useApi } from "@/lib/use-api";

const skeleton = (
  <div role="status" aria-busy="true" className="divide-y rounded-xl border bg-card">
    <span className="sr-only">Loading</span>
    {Array.from({ length: 6 }, (_, i) => (
      <div key={i} className="grid grid-cols-[1.75rem_minmax(0,1fr)] items-center gap-x-4 gap-y-2 px-4 py-3 sm:px-5 md:grid-cols-[2rem_minmax(0,1fr)_11rem_6rem_6rem_5rem]">
        <Skeleton className="h-4 w-4" />
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="col-start-2 h-4 md:col-start-auto" />
        <Skeleton className="col-start-2 h-3.5 w-24 md:col-start-auto" />
        <Skeleton className="hidden h-3.5 w-20 md:block" />
        <Skeleton className="hidden h-3.5 w-14 md:block" />
      </div>
    ))}
  </div>
);

export default function Flaky() {
  const { repo } = useRepo();
  const res = useApi<{ items: FlakyTest[] }>(`/api/repos/${repo.id}/flaky-tests`);
  return (
    <>
      <PageHeader title="Flaky tests" description="Tests that fail intermittently, worst first." />
      <Load
        res={res}
        fallback={skeleton}
        isEmpty={(d) => d.items.length === 0}
        empty={
          <EmptyState
            art="chart"
            title="No flaky tests yet"
            description="Tests show up after repeated flaky CI failures."
            action={
              <Button asChild variant="outline">
                <Link href={repoPath(repo.id, "ci-gate")}>Open CI gate</Link>
              </Button>
            }
          />
        }
      >
        {(d) => <FlakyList tests={d.items} />}
      </Load>
    </>
  );
}
