"use client";
import { useState } from "react";
import { ArrowUpRight } from "lucide-react";
import { EvilBarChart } from "@/components/evilcharts/charts/recharts-bar-chart";
import { Button } from "@/components/ui/button";
import { chartTheme } from "@/lib/chart-theme";
import { ago, when } from "@/lib/fmt";
import type { FlakyTest } from "@/lib/types";

const config = chartTheme({ occurrences: { role: "series1", label: "Occurrences" } });
const FIRST = 25; // one chart per row, so show the worst first and the rest on request
const COLS = "md:grid-cols-[2rem_minmax(0,1fr)_11rem_6rem_6rem_5rem]";

/** Ranked flaky tests as a table on md+ and stacked rows on phones (one markup, grid areas change). */
export function FlakyList({ tests }: { tests: FlakyTest[] }) {
  const [all, setAll] = useState(false);
  const ranked = [...tests].sort((a, b) => b.occurrences - a.occurrences || a.test_id.localeCompare(b.test_id));
  const max = ranked[0]?.occurrences ?? 1;
  const rows = all ? ranked : ranked.slice(0, FIRST);
  return (
    <div className="rounded-xl border bg-card shadow-sm" role="table" aria-label="Flaky tests, most frequent first">
      <div role="row" className={`hidden gap-x-4 border-b px-5 py-2.5 text-[13px] font-medium text-muted-foreground md:grid ${COLS}`}>
        <span role="columnheader">#</span>
        <span role="columnheader">Test</span>
        <span role="columnheader">Occurrences</span>
        <span role="columnheader">First seen</span>
        <span role="columnheader">Last seen</span>
        <span role="columnheader">Last run</span>
      </div>
      <ul role="rowgroup" className="divide-y">
        {rows.map((t, i) => (
          <li key={t.test_id} role="row" className={`grid grid-cols-[1.75rem_minmax(0,1fr)] items-center gap-x-4 gap-y-1.5 px-4 py-3 hover:bg-muted/40 sm:px-5 ${COLS}`}>
            <span role="cell" className="row-span-3 self-start text-xs text-muted-foreground tabular-nums md:row-span-1 md:self-center">{i + 1}</span>
            <span role="cell" className="col-start-2 min-w-0 font-mono text-[13px] break-all md:col-start-auto" title={t.test_id}>{t.test_id}</span>
            <span role="cell" className="col-start-2 flex items-center gap-2 md:col-start-auto">
              <EvilBarChart
                data={[{ k: t.test_id, occurrences: t.occurrences }]}
                config={config}
                layout="horizontal"
                animationType="none"
                barRadius={3}
                className="aspect-auto h-4 flex-1"
                chartProps={{ margin: { top: 0, right: 0, bottom: 0, left: 0 } }}
              >
                <EvilBarChart.XAxis hide domain={[0, max]} />
                <EvilBarChart.YAxis hide dataKey="k" />
                <EvilBarChart.Bar dataKey="occurrences" />
              </EvilBarChart>
              <span className="w-8 text-right text-sm font-medium tabular-nums">{t.occurrences}</span>
            </span>
            <div className="col-start-2 flex flex-wrap items-center gap-x-4 gap-y-1 md:contents">
              <span role="cell" className="text-[13px] text-muted-foreground">
                <span className="md:hidden">First seen </span>
                <time dateTime={t.first_seen} title={when(t.first_seen)}>{ago(t.first_seen)}</time>
              </span>
              <span role="cell" className="text-[13px] text-muted-foreground">
                <span className="md:hidden">Last seen </span>
                <time dateTime={t.last_seen} title={when(t.last_seen)}>{ago(t.last_seen)}</time>
              </span>
              <span role="cell" className="text-[13px]">
                {t.last_run_url ? (
                  <a href={t.last_run_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 rounded-sm underline-offset-4 hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">
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
      {!all && ranked.length > FIRST && (
        <div className="border-t p-3 text-center">
          <Button variant="ghost" size="sm" onClick={() => setAll(true)}>
            Show all {ranked.length}
          </Button>
        </div>
      )}
    </div>
  );
}
