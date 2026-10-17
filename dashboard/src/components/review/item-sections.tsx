"use client";
import { ChevronRight, Eye, type LucideIcon } from "lucide-react";
import { useState, type ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { CopyButton } from "@/components/ui/copy-button";
import { Select } from "@/components/ui/select";
import { Status, type StatusTone } from "@/components/ui/status";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "@/components/ui/toaster";
import { api, errText } from "@/lib/api";
import { pct, when } from "@/lib/fmt";
import type { Decision, ItemDetail, Run } from "@/lib/types";
import { cn } from "@/lib/utils";

type Override = ItemDetail["overrides"][number];

export function Section({ title, aside, children }: { title: string; aside?: ReactNode; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-baseline gap-3">
        <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
        {aside && <span className="text-sm text-muted-foreground">{aside}</span>}
      </div>
      {children}
    </section>
  );
}

const Muted = ({ children }: { children: ReactNode }) => <p className="text-sm text-muted-foreground">{children}</p>;

const OUTCOME: Record<string, { tone: StatusTone; label: string; icon?: LucideIcon }> = {
  acted: { tone: "success", label: "Auto-acted" },
  queued: { tone: "waiting", label: "Queued" },
  held: { tone: "warning", label: "Held" },
  shadow: { tone: "neutral", label: "Shadow", icon: Eye },
  skipped: { tone: "neutral", label: "Skipped" },
  pending: { tone: "progress", label: "Pending" },
};

// Answer segment first and darkest; the rest fade. Same ramp for bar and legend.
const SHADES = ["bg-foreground", "bg-foreground/55", "bg-foreground/35", "bg-foreground/20", "bg-foreground/10"];
const shade = (i: number) => SHADES[Math.min(i, SHADES.length - 1)];

/** The whole distribution as one stacked bar. The tick sits at the threshold the leading answer had to reach. */
function Distribution({ probabilities, answer, threshold }: Pick<Decision, "probabilities" | "answer" | "threshold">) {
  const opts = Object.entries(probabilities).sort((a, b) => b[1] - a[1]);
  return (
    <div>
      <div role="img" aria-label={`${opts.map(([o, p]) => `${o} ${pct(p)}`).join(", ")}. Threshold ${pct(threshold)}.`} className="relative h-2 rounded-full bg-muted">
        <div className="flex size-full gap-px overflow-hidden rounded-full">
          {opts.map(([o, p], i) => (
            <div key={o} className={shade(i)} style={{ width: `${p * 100}%` }} />
          ))}
        </div>
        <div aria-hidden className="absolute -inset-y-0.5 w-0.5 -translate-x-1/2 rounded-full bg-warning" style={{ left: `${threshold * 100}%` }} />
      </div>
      <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
        {opts.slice(0, 6).map(([o, p], i) => (
          <li key={o} className="inline-flex items-center gap-1.5">
            <span aria-hidden className={cn("size-2 rounded-full", shade(i))} />
            <span className={cn(o === answer && "font-medium text-foreground")}>{o}</span>
            <span className="tabular-nums">{pct(p)}</span>
          </li>
        ))}
        {opts.length > 6 && <li>+{opts.length - 6} more</li>}
      </ul>
    </div>
  );
}

function DecisionRow({ x, last, canAct, reload }: { x: Decision; last?: Override; canAct: boolean; reload: () => void }) {
  const [picked, setPicked] = useState<string>();
  const [busy, setBusy] = useState(false);
  const value = picked ?? last?.new_answer ?? x.answer;
  const o = OUTCOME[x.outcome] ?? { tone: "neutral" as const, label: x.outcome };
  const opts = Object.keys(x.probabilities).sort((a, b) => x.probabilities[b] - x.probabilities[a]);

  async function override(answer: string) {
    if (answer === value) return;
    setPicked(answer);
    setBusy(true);
    try {
      await toast.promise(api(`/api/decisions/${x.id}/override`, { method: "POST", body: { answer } }), {
        loading: "Saving override",
        success: `Overridden to ${answer}`,
        error: (e) => `Could not override: ${errText(e)}`,
      });
      reload();
    } catch {
      setPicked(undefined);
    } finally {
      setBusy(false);
    }
  }

  return (
    <li className="grid gap-4 py-4 first:pt-0 last:pb-0 sm:grid-cols-[minmax(0,1fr)_13rem]">
      <div className="flex min-w-0 flex-col gap-3">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <span className="font-mono text-[13px]">{x.question_id}</span>
          <span className="text-sm">
            <span className="font-medium">{x.answer}</span> <span className="tabular-nums">{pct(x.confidence, 1)}</span>
            <span className="text-muted-foreground tabular-nums"> · threshold {pct(x.threshold)}</span>
          </span>
          <Status tone={o.tone} icon={o.icon}>{o.label}</Status>
        </div>
        <Distribution probabilities={x.probabilities} answer={x.answer} threshold={x.threshold} />
      </div>
      <div className="flex flex-col gap-1.5">
        <span id={`ov-${x.id}`} className="text-xs text-muted-foreground">Override answer</span>
        <Select size="sm" aria-labelledby={`ov-${x.id}`} value={value} onValueChange={override} disabled={!canAct || busy}>
          {opts.map((a) => <option key={a} value={a}>{a}</option>)}
        </Select>
        {last ? (
          <p className="text-xs text-muted-foreground">Set to {last.new_answer} by {last.user}</p>
        ) : !canAct ? (
          <p className="text-xs text-muted-foreground">Maintainer access required</p>
        ) : null}
      </div>
    </li>
  );
}

/** Latest run first; older runs fold away. Each decision is a row with its distribution and an inline override. */
export function Decisions({ runs, overrides, canAct, reload }: { runs: Run[]; overrides: Override[]; canAct: boolean; reload: () => void }) {
  const withDecisions = runs.filter((r) => r.decisions.length);
  if (!withDecisions.length) return <Muted>No decisions yet. They appear after Jev&apos;s first run on this item.</Muted>;
  const list = (r: Run) => (
    <ul className="divide-y divide-border">
      {r.decisions.map((x) => (
        <DecisionRow key={x.id} x={x} last={overrides.filter((o) => o.decision_id === x.id).at(-1)} canAct={canAct} reload={reload} />
      ))}
    </ul>
  );
  const [latest, ...older] = withDecisions;
  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-lg border p-4">
        <p className="mb-4 text-xs text-muted-foreground">Latest run #{latest.id} · {when(latest.created_at)}</p>
        {list(latest)}
      </div>
      {older.map((r) => (
        <details key={r.id} className="group rounded-lg border">
          <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3 text-sm text-muted-foreground outline-none select-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
            <ChevronRight aria-hidden className="size-4 motion-safe:transition-transform motion-safe:duration-150 group-open:rotate-90" />
            Run #{r.id} · {when(r.created_at)}
          </summary>
          <div className="border-t p-4">{list(r)}</div>
        </details>
      ))}
    </div>
  );
}

/** The exact state text of the latest run: mono, collapsed by default, copyable. */
export function Seen({ run }: { run?: Run }) {
  return (
    <details className="group">
      <summary className="flex w-fit cursor-pointer list-none items-center gap-2 rounded-md outline-none select-none focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
        <ChevronRight aria-hidden className="size-4 text-muted-foreground motion-safe:transition-transform motion-safe:duration-150 group-open:rotate-90" />
        <h2 className="text-lg font-semibold tracking-tight">What Jev saw</h2>
        <span className="text-sm text-muted-foreground">Exact text sent to the model</span>
      </summary>
      <div className="relative mt-3 rounded-lg border bg-muted/30">
        {run?.state_text ? (
          <>
            <CopyButton value={run.state_text} className="absolute top-1 right-1" />
            <pre tabIndex={0} aria-label="State text" className="max-h-96 overflow-auto p-4 pr-12 font-mono text-[13px] leading-6 break-words whitespace-pre-wrap outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset">{run.state_text}</pre>
          </>
        ) : (
          <p className="p-4 text-sm text-muted-foreground">{run ? "The text was purged after the retention period." : "Nothing was sent yet."}</p>
        )}
      </div>
    </details>
  );
}

export function ActionsTaken({ actions }: { actions: ItemDetail["actions"] }) {
  if (!actions.length) return <Muted>Nothing was changed on GitHub.</Muted>;
  return (
    <Table>
      <TableHeader><TableRow className="hover:bg-transparent"><TableHead>When</TableHead><TableHead>Action</TableHead><TableHead>Reference</TableHead><TableHead /></TableRow></TableHeader>
      <TableBody>
        {actions.map((a) => (
          <TableRow key={a.id}>
            <TableCell className="text-muted-foreground tabular-nums">{when(a.created_at)}</TableCell>
            <TableCell className="font-mono text-[13px]">{a.kind}</TableCell>
            <TableCell className="font-mono text-[13px] text-muted-foreground">{a.github_ref ?? "none"}</TableCell>
            <TableCell className="text-right">{a.dry_run && <Badge variant="warning" title="Recorded only. Nothing was written to GitHub.">Dry run</Badge>}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

export function OverridesHistory({ overrides, runs }: { overrides: Override[]; runs: Run[] }) {
  if (!overrides.length) return <Muted>No one has overridden Jev here.</Muted>;
  const question = new Map(runs.flatMap((r) => r.decisions.map((x) => [x.id, x.question_id] as const)));
  return (
    <Table>
      <TableHeader><TableRow className="hover:bg-transparent"><TableHead>When</TableHead><TableHead>Who</TableHead><TableHead>Question</TableHead><TableHead>New answer</TableHead></TableRow></TableHeader>
      <TableBody>
        {[...overrides].reverse().map((o) => (
          <TableRow key={o.id}>
            <TableCell className="text-muted-foreground tabular-nums">{when(o.created_at)}</TableCell>
            <TableCell>{o.user}</TableCell>
            <TableCell className="font-mono text-[13px]">{question.get(o.decision_id) ?? o.decision_id}</TableCell>
            <TableCell className="font-medium">{o.new_answer}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

export function RunsTable({ runs }: { runs: Run[] }) {
  if (!runs.length) return <Muted>Jev has not evaluated this item yet.</Muted>;
  return (
    <Table>
      <TableHeader>
        <TableRow className="hover:bg-transparent">
          <TableHead>Run</TableHead><TableHead>When</TableHead><TableHead>Model</TableHead><TableHead>Calibration</TableHead>
          <TableHead className="text-right">Latency</TableHead><TableHead className="text-right">Tokens</TableHead><TableHead className="text-right">Cost</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {runs.flatMap((r) => [
          <TableRow key={r.id} className={r.error ? "border-b-0" : undefined}>
            <TableCell className="tabular-nums">#{r.id} <span className="text-muted-foreground">{r.trigger}</span></TableCell>
            <TableCell className="text-muted-foreground tabular-nums">{when(r.created_at)}</TableCell>
            <TableCell className="font-mono text-[13px]">{r.model_version} <span className="text-muted-foreground">{r.backend}</span></TableCell>
            <TableCell>{r.calibrated ? <Badge variant="success">Calibrated</Badge> : <Badge variant="warning" title="Probabilities from this backend are not calibrated.">Uncalibrated</Badge>}</TableCell>
            <TableCell className="text-right tabular-nums">{r.latency_ms} ms</TableCell>
            <TableCell className="text-right tabular-nums">{r.tokens_in.toLocaleString("en-US")}</TableCell>
            <TableCell className="text-right tabular-nums">${r.cost_usd.toFixed(4)}</TableCell>
          </TableRow>,
          ...(r.error
            ? [<TableRow key={`${r.id}-e`}><TableCell colSpan={7} className="pt-0 whitespace-normal"><Status tone="danger">Run failed: {r.error}</Status></TableCell></TableRow>]
            : []),
        ])}
      </TableBody>
    </Table>
  );
}
