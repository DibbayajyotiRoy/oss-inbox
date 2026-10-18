"use client";
import { ArrowUpRight } from "lucide-react";
import { ago, when } from "@/lib/fmt";
import type { FlakyTest } from "@/lib/types";
import { TestName } from "./test-name";

const COLS = "md:grid-cols-[2rem_minmax(0,1fr)_11rem_6rem_6rem_5rem]";

/** Tests that fail at random, ranked, as a table on md+ and stacked rows on phones (one markup, grid areas change). The count is the reading; its bar is the quiet brand ramp colour so it never outshines the test name. */
export function FlakyList({ tests }: { tests: FlakyTest[] }) {
  const ranked = [...tests].sort((a, b) => b.occurrences - a.occurrences || a.test_id.localeCompare(b.test_id));
  const max = ranked[0]?.occurrences ?? 1;
  return (
    <div className="rounded-xl border bg-card shadow-sm" role="table" aria-label="Tests that fail at random, most often first">
      <div role="row" className={`hidden gap-x-4 border-b px-5 py-2.5 text-[13px] font-medium text-muted-foreground md:grid ${COLS}`}>
        <span role="columnheader">#</span>
        <span role="columnheader">Test</span>
        <span role="columnheader">Times failed</span>
        <span role="columnheader">First failed</span>
        <span role="columnheader">Last failed</span>
        <span role="columnheader">Last run</span>
      </div>
      <ul role="rowgroup" className="divide-y">
        {ranked.map((t, i) => (
          <li key={t.test_id} role="row" className={`grid grid-cols-[1.75rem_minmax(0,1fr)] items-center gap-x-4 gap-y-1.5 px-4 py-3 hover:bg-muted/40 sm:px-5 ${COLS}`}>
            <span role="cell" className="row-span-3 self-start text-xs text-muted-foreground tabular-nums md:row-span-1 md:self-center">{i + 1}</span>
            <span role="cell" className="col-start-2 min-w-0 md:col-start-auto">
              <TestName id={t.test_id} />
            </span>
            <span role="cell" className="col-start-2 flex items-center gap-3 md:col-start-auto">
              <span aria-hidden className="h-1.5 flex-1 rounded-full bg-muted">
                <span className="block h-full min-w-1 rounded-full bg-chart-1" style={{ width: `${(t.occurrences / max) * 100}%` }} />
              </span>
              <span className="w-8 text-right text-base font-semibold tabular-nums">{t.occurrences}</span>
            </span>
            <div className="col-start-2 flex flex-wrap items-center gap-x-4 gap-y-1 md:contents">
              <span role="cell" className="text-[13px] text-muted-foreground">
                <span className="md:hidden">First failed </span>
                <time dateTime={t.first_seen} title={when(t.first_seen)}>{ago(t.first_seen)}</time>
              </span>
              <span role="cell" className="text-[13px] text-muted-foreground">
                <span className="md:hidden">Last failed </span>
                <time dateTime={t.last_seen} title={when(t.last_seen)}>{ago(t.last_seen)}</time>
              </span>
              <span role="cell" className="text-[13px]">
                {t.last_run_url ? (
                  <a href={t.last_run_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 rounded-sm underline-offset-4 link-grow focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">
                    CI run
                    <ArrowUpRight aria-hidden className="size-3" />
                    <span className="sr-only"> (opens in a new tab)</span>
                  </a>
                ) : (
                  <span className="text-muted-foreground">No run</span>
                )}
              </span>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
