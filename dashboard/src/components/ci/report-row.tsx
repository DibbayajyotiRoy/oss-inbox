"use client";
import Link from "next/link";
import { useId, useState } from "react";
import { ArrowUpRight, ChevronRight } from "lucide-react";
import { Meter } from "@/components/ui/meter";
import { ago, issueUrl, repoPath, when } from "@/lib/fmt";
import type { CiReport } from "@/lib/types";
import { cn } from "@/lib/utils";
import { OutcomeStatus } from "./outcome";
import { testOf, TestName } from "./test-name";

const link = "inline-flex items-center gap-0.5 rounded-sm text-foreground underline-offset-4 link-grow focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none";
const Ext = ({ href, children }: { href: string; children: React.ReactNode }) => (
  <a href={href} target="_blank" rel="noreferrer" className={link}>
    {children}
    <ArrowUpRight aria-hidden className="size-3" />
    <span className="sr-only"> (opens in a new tab)</span>
  </a>
);

/** One CI report: outcome, title, where it went, and (expandable) the similar issues Jev weighed. `grouped`: inside a test's group, so the (repeated) title gives way to the time. */
export function ReportRow({ r, repoId, fullName, grouped }: { r: CiReport; repoId: number; fullName: string; grouped?: boolean }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const n = r.candidates.length;
  const test = testOf(r.title);
  const time = <time dateTime={r.created_at} title={when(r.created_at)}>{ago(r.created_at)}</time>;
  return (
    <li className="px-4 py-3.5 hover:bg-muted/40 sm:px-5">
      <div className="grid gap-x-4 gap-y-1 sm:grid-cols-[11rem_minmax(0,1fr)_auto]">
        <OutcomeStatus outcome={r.outcome} className="self-start" />
        {grouped ? (
          <p className="min-w-0 text-sm font-medium">{time}</p>
        ) : test ? (
          <TestName id={test} className="min-w-0 self-center" />
        ) : (
          <p className="min-w-0 text-sm font-medium break-words">{r.title}</p>
        )}
        <p className="text-xs text-muted-foreground sm:text-right">{grouped ? r.source : <>{r.source} · {time}</>}</p>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px] text-muted-foreground sm:col-start-2 sm:col-span-2">
          {r.issue_number !== null && <Ext href={issueUrl(fullName, r.issue_number)}>Filed as #{r.issue_number}</Ext>}
          {r.merged_into !== null && <Ext href={issueUrl(fullName, r.merged_into)}>Merged into #{r.merged_into}</Ext>}
          {r.run_url && <Ext href={r.run_url}>CI run</Ext>}
          {r.outcome === "held" && <Link href={repoPath(repoId, "held")} className={link}>Open in Held for a check</Link>}
          {r.outcome === "queued" && <Link href={repoPath(repoId, "queue")} className={link}>Open in Needs review</Link>}
          {n > 0 && (
            <button
              type="button"
              aria-expanded={open}
              aria-controls={id}
              onClick={() => setOpen(!open)}
              className="inline-flex items-center gap-1 rounded-sm link-grow hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            >
              <ChevronRight aria-hidden className={cn("size-3.5 motion-safe:transition-transform motion-safe:duration-150 motion-safe:ease-settle", open && "rotate-90")} />
              Jev compared {n} similar {n === 1 ? "issue" : "issues"}
            </button>
          )}
        </div>
      </div>
      {n > 0 && (
        <div id={id} inert={!open} className={cn("grid motion-safe:transition-[grid-template-rows] motion-safe:duration-250 motion-safe:ease-settle", open ? "grid-rows-[1fr]" : "grid-rows-[0fr]")}>
          <ul className="min-h-0 overflow-hidden sm:ml-48">
            {r.candidates.map((c) => (
              <li key={c.item_id} className="grid gap-x-6 gap-y-1.5 border-t py-2.5 first:mt-3 md:grid-cols-[minmax(0,1fr)_13rem_13rem] md:items-center">
                <Link href={`/items/${c.item_id}`} className="inline-block max-w-full min-w-0 truncate align-top text-sm link-grow focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none" title={c.title}>
                  {c.number ? <span className="text-muted-foreground tabular-nums">#{c.number} </span> : null}
                  {c.title}
                </Link>
                <span title={`Match score ${c.retrieval_score.toFixed(3)}`}>
                  <Meter value={c.retrieval_score} state="queued" label="Looks similar" />
                </span>
                {c.same_as_probability === null ? (
                  <span className="text-xs text-muted-foreground">Same problem: not checked</span>
                ) : (
                  <Meter value={c.same_as_probability} state="acted" label="Same problem" />
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </li>
  );
}
