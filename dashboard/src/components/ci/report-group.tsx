"use client";
import { useId, useState } from "react";
import { ChevronRight } from "lucide-react";
import { ago, when } from "@/lib/fmt";
import type { CiReport } from "@/lib/types";
import { cn } from "@/lib/utils";
import { OutcomeStatus } from "./outcome";
import { ReportRow } from "./report-row";
import { testOf, TestName } from "./test-name";

/** Reports grouped by failing test (any other title groups by itself), in order of each group's newest report. */
export function groupReports(reports: CiReport[]) {
  const groups = new Map<string, CiReport[]>();
  for (const r of reports) {
    const key = testOf(r.title) ?? r.title;
    groups.set(key, [...(groups.get(key) ?? []), r]);
  }
  return [...groups].map(([key, rs]) => ({ key, reports: rs }));
}

/** One failing test: how often it failed, how the newest report ended, and (expandable) every report. */
export function ReportGroup({ test, reports, repoId, fullName }: { test: string; reports: CiReport[]; repoId: number; fullName: string }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const [latest] = reports;
  return (
    <li>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen(!open)}
        className="grid w-full gap-x-4 gap-y-1 px-4 py-3.5 text-left outline-none motion-safe:transition-colors motion-safe:duration-150 hover:bg-muted/60 focus-visible:bg-muted/60 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset sm:grid-cols-[11rem_minmax(0,1fr)_auto] sm:px-5"
      >
        <span className="flex items-center gap-1.5 self-start">
          <ChevronRight aria-hidden className={cn("size-3.5 shrink-0 text-muted-foreground motion-safe:transition-transform motion-safe:duration-150 motion-safe:ease-settle", open && "rotate-90")} />
          <span className="sr-only">Latest result: </span>
          <OutcomeStatus outcome={latest.outcome} />
        </span>
        <TestName id={test} className="min-w-0 self-center" />
        <span className="text-xs text-muted-foreground sm:text-right">
          <span className="text-sm font-semibold text-foreground tabular-nums">{reports.length}</span> {reports.length === 1 ? "report" : "reports"} · latest <time dateTime={latest.created_at} title={when(latest.created_at)}>{ago(latest.created_at)}</time>
        </span>
      </button>
      {open && (
        <ul id={id} aria-label={`Reports for ${test}`} className="divide-y border-t bg-muted/30 motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-top-1 motion-safe:duration-200">
          {reports.map((r) => (
            <ReportRow key={r.id} r={r} repoId={repoId} fullName={fullName} grouped />
          ))}
        </ul>
      )}
    </li>
  );
}
