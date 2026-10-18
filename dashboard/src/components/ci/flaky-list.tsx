"use client";
import { ArrowUpRight } from "lucide-react";
import { DataTable } from "@/components/ui/data-table";
import { ago, when } from "@/lib/fmt";
import type { FlakyTest } from "@/lib/types";
import { TestName } from "./test-name";

const seen = (iso: string) => <time dateTime={iso} title={when(iso)}>{ago(iso)}</time>;

/** Tests that fail at random, ranked. The count is the reading; its bar is the quiet brand ramp colour so it never outshines the test name. */
export function FlakyList({ tests }: { tests: FlakyTest[] }) {
  const ranked = [...tests].sort((a, b) => b.occurrences - a.occurrences || a.test_id.localeCompare(b.test_id));
  const max = ranked[0]?.occurrences ?? 1;
  const rank = new Map(ranked.map((t, i) => [t.test_id, i + 1]));
  return (
    <div className="rounded-xl border bg-card p-4 shadow-sm sm:px-5">
      <DataTable
        label="Tests that fail at random, most often first"
        storageKey="flaky-tests"
        rows={ranked}
        rowKey={(t) => t.test_id}
        columns={[
          { key: "rank", header: "#", width: "2rem", cellClassName: "text-xs text-muted-foreground tabular-nums", cell: (t) => rank.get(t.test_id) },
          { key: "test", header: "Test", cellClassName: "whitespace-normal", cell: (t) => <TestName id={t.test_id} className="block max-w-[min(36rem,55vw)]" /> },
          {
            key: "times",
            header: "Times failed",
            cell: (t) => (
              <span className="flex w-44 items-center gap-3">
                <span aria-hidden className="h-1.5 flex-1 rounded-full bg-muted">
                  <span className="block h-full min-w-1 rounded-full bg-chart-1" style={{ width: `${(t.occurrences / max) * 100}%` }} />
                </span>
                <span className="w-8 text-right text-base font-semibold tabular-nums">{t.occurrences}</span>
              </span>
            ),
          },
          { key: "first", header: "First failed", className: "max-md:hidden", cellClassName: "text-[13px] text-muted-foreground", cell: (t) => seen(t.first_seen) },
          { key: "last", header: "Last failed", cellClassName: "text-[13px] text-muted-foreground", cell: (t) => seen(t.last_seen) },
          {
            key: "run",
            header: "Last run",
            cellClassName: "text-[13px]",
            cell: (t) =>
              t.last_run_url ? (
                <a href={t.last_run_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 rounded-sm underline-offset-4 link-grow focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">
                  CI run
                  <ArrowUpRight aria-hidden className="size-3" />
                  <span className="sr-only"> (opens in a new tab)</span>
                </a>
              ) : (
                <span className="text-muted-foreground">No run</span>
              ),
          },
        ]}
      />
    </div>
  );
}
