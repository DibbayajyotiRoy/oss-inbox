"use client";
import { ChevronRight, Eye, type LucideIcon } from "lucide-react";
import { useState, type ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { CopyButton } from "@/components/ui/copy-button";
import { DataTable } from "@/components/ui/data-table";
import { Section as NavSection } from "@/components/ui/section-nav";
import { Select } from "@/components/ui/select";
import { Status, type StatusTone } from "@/components/ui/status";
import { toast } from "@/components/ui/toaster";
import { api, errText } from "@/lib/api";
import { pct, when } from "@/lib/fmt";
import { answerText, questionLabel } from "@/lib/questions";
import type { Decision, ItemDetail, Run } from "@/lib/types";
import { cn } from "@/lib/utils";

type Override = ItemDetail["overrides"][number];

/** One item-page section; `SectionNav` lists it under its title. */
export function Section({ title, aside, children }: { title: string; aside?: ReactNode; children: ReactNode }) {
  return (
    <NavSection id={title.toLowerCase().replace(/[^a-z0-9]+/g, "-")} label={title} className="flex flex-col gap-3">
      <div className="flex items-baseline gap-3">
        <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
        {aside && <span className="text-sm text-muted-foreground">{aside}</span>}
      </div>
      {children}
    </NavSection>
  );
}

const Muted = ({ children }: { children: ReactNode }) => <p className="text-sm text-muted-foreground">{children}</p>;

export const OUTCOME: Record<string, { tone: StatusTone; label: string; icon?: LucideIcon }> = {
  acted: { tone: "success", label: "Acted on its own" },
  queued: { tone: "waiting", label: "Waiting for you" },
  held: { tone: "warning", label: "Held" },
  shadow: { tone: "neutral", label: "Learning only", icon: Eye },
  skipped: { tone: "neutral", label: "Not needed" },
  pending: { tone: "progress", label: "Pending" },
};

// Answer segment first and darkest; the rest fade. Same ramp for bar and legend.
const SHADES = ["bg-foreground", "bg-foreground/55", "bg-foreground/35", "bg-foreground/20", "bg-foreground/10"];
const shade = (i: number) => SHADES[Math.min(i, SHADES.length - 1)];

/** The whole spread of answers as one stacked bar. The tick sits at how sure Jev had to be to act on its own. */
function Distribution({ question_id: qid, probabilities, answer, threshold }: Pick<Decision, "question_id" | "probabilities" | "answer" | "threshold">) {
  const opts = Object.entries(probabilities).sort((a, b) => b[1] - a[1]);
  return (
    <div>
      <div role="img" aria-label={`${opts.map(([o, p]) => `${answerText(qid, o)} ${pct(p)}`).join(", ")}. Acts on its own at ${pct(threshold)}.`} className="relative h-2 rounded-full bg-muted">
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
            <span className={cn(o === answer && "font-medium text-foreground")}>{answerText(qid, o)}</span>
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
        loading: "Saving your answer",
        success: `Changed to "${answerText(x.question_id, answer)}"`,
        error: (e) => `Could not save: ${errText(e)}`,
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
          <span className="text-[13px] font-medium">{questionLabel(x.question_id)}</span>
          <span className="font-mono text-[11px] text-muted-foreground">{x.question_id}</span>
          <Status tone={o.tone} icon={o.icon}>{o.label}</Status>
        </div>
        <p className="text-sm">
          <span className="font-medium">{answerText(x.question_id, x.answer)}</span> <span className="tabular-nums">· {pct(x.confidence, 1)} sure</span>
          <span className="text-muted-foreground tabular-nums"> · acts on its own at {pct(x.threshold)}</span>
        </p>
        <Distribution question_id={x.question_id} probabilities={x.probabilities} answer={x.answer} threshold={x.threshold} />
      </div>
      <div className="flex flex-col gap-1.5">
        <span id={`ov-${x.id}`} className="text-xs text-muted-foreground">Change the answer</span>
        <Select size="sm" aria-labelledby={`ov-${x.id}`} value={value} onValueChange={override} disabled={!canAct || busy}>
          {opts.map((a) => <option key={a} value={a}>{answerText(x.question_id, a)}</option>)}
        </Select>
        {last ? (
          <p className="text-xs text-muted-foreground">Set to {answerText(x.question_id, last.new_answer)} by {last.user}</p>
        ) : !canAct ? (
          <p className="text-xs text-muted-foreground">Maintainer access required</p>
        ) : null}
      </div>
    </li>
  );
}

const FOLD = "flex cursor-pointer list-none items-center gap-2 text-sm text-muted-foreground outline-none select-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden";
const Chevron = () => <ChevronRight aria-hidden className="size-4 motion-safe:transition-transform motion-safe:duration-150 group-open:rotate-90" />;

/** "3 auto-acted · 2 shadow · 9 skipped": what the latest run did, before the rows. */
function Summary({ decisions }: { decisions: Decision[] }) {
  const n = Map.groupBy(decisions, (x) => x.outcome);
  const parts = Object.keys(OUTCOME).filter((k) => n.has(k));
  return (
    <p className="text-sm text-muted-foreground tabular-nums">
      {parts.map((k, i) => (
        <span key={k}>
          {i > 0 && " · "}
          <span className="font-medium text-foreground">{n.get(k)?.length}</span> {OUTCOME[k].label.toLowerCase()}
        </span>
      ))}
    </p>
  );
}

/** Latest run first, skipped decisions folded away; older runs fold too. Each decision is a row with its distribution and an inline override. */
export function Decisions({ runs, overrides, canAct, reload }: { runs: Run[]; overrides: Override[]; canAct: boolean; reload: () => void }) {
  const withDecisions = runs.filter((r) => r.decisions.length);
  if (!withDecisions.length) return <Muted>Nothing yet. Answers show up after Jev first looks at this item.</Muted>;
  const list = (ds: Decision[]) => (
    <ul className="divide-y divide-border">
      {ds.map((x) => (
        <DecisionRow key={x.id} x={x} last={overrides.filter((o) => o.decision_id === x.id).at(-1)} canAct={canAct} reload={reload} />
      ))}
    </ul>
  );
  const [latest, ...older] = withDecisions;
  const skipped = latest.decisions.filter((x) => x.outcome === "skipped");
  const rest = latest.decisions.filter((x) => x.outcome !== "skipped");
  return (
    <div className="flex flex-col gap-4">
      <Summary decisions={latest.decisions} />
      <div className="rounded-lg border p-4">
        <p className="mb-4 text-xs text-muted-foreground">Latest check #{latest.id} · {when(latest.created_at)}</p>
        {rest.length > 0 && list(rest)}
        {skipped.length > 0 && (
          <details className={cn("group", rest.length > 0 && "mt-4 border-t pt-3")}>
            <summary className={cn(FOLD, "w-fit rounded-md")}><Chevron />{skipped.length} not needed</summary>
            <div className="pt-4">{list(skipped)}</div>
          </details>
        )}
      </div>
      {older.map((r) => (
        <details key={r.id} className="group rounded-lg border">
          <summary className={cn(FOLD, "px-4 py-3")}><Chevron />Check #{r.id} · {when(r.created_at)}</summary>
          <div className="border-t p-4">{list(r.decisions)}</div>
        </details>
      ))}
    </div>
  );
}

/** The exact state text of the latest run: mono, collapsed by default, copyable. */
export function Seen({ run }: { run?: Run }) {
  return (
    <NavSection id="what-jev-saw" label="What Jev saw">
    <details className="group">
      <summary className="flex w-fit cursor-pointer list-none items-center gap-2 rounded-md outline-none select-none focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
        <ChevronRight aria-hidden className="size-4 text-muted-foreground motion-safe:transition-transform motion-safe:duration-150 group-open:rotate-90" />
        <h2 className="text-lg font-semibold tracking-tight">What Jev saw</h2>
        <span className="text-sm text-muted-foreground">The exact text Jev read</span>
      </summary>
      <div className="relative mt-3 rounded-lg border bg-muted/30">
        {run?.state_text ? (
          <>
            <CopyButton value={run.state_text} className="absolute top-1 right-1" />
            <pre tabIndex={0} aria-label="State text" className="max-h-96 overflow-auto p-4 pr-12 font-mono text-[13px] leading-6 break-words whitespace-pre-wrap outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset">{run.state_text}</pre>
          </>
        ) : (
          <p className="p-4 text-sm text-muted-foreground">{run ? "This text was deleted after a while." : "Jev hasn't read this yet."}</p>
        )}
      </div>
    </details>
    </NavSection>
  );
}

const mono = "font-mono text-[13px]";

export function ActionsTaken({ actions }: { actions: ItemDetail["actions"] }) {
  if (!actions.length) return <Muted>Nothing was changed on GitHub.</Muted>;
  return (
    <DataTable
      label="What was done on GitHub"
      storageKey="item-actions"
      rows={actions}
      rowKey={(a) => a.id}
      columns={[
        { key: "when", header: "When", cellClassName: "text-muted-foreground tabular-nums", cell: (a) => when(a.created_at) },
        { key: "kind", header: "Action", cellClassName: mono },
        { key: "ref", header: "Reference", cellClassName: cn(mono, "text-muted-foreground"), cell: (a) => a.github_ref ?? "none" },
        {
          key: "status",
          header: <span className="sr-only">Status</span>,
          align: "right",
          cell: (a) => a.dry_run && <Badge variant="warning" title="Recorded only. Nothing was written to GitHub.">Dry run</Badge>,
        },
      ]}
    />
  );
}

export function OverridesHistory({ overrides, runs }: { overrides: Override[]; runs: Run[] }) {
  if (!overrides.length) return <Muted>No one has changed Jev&apos;s answers here.</Muted>;
  const question = new Map(runs.flatMap((r) => r.decisions.map((x) => [x.id, x.question_id] as const)));
  const qid = (o: Override) => question.get(o.decision_id) ?? "";
  return (
    <DataTable
      label="Answers changed by people"
      storageKey="item-overrides"
      rows={[...overrides].reverse()}
      rowKey={(o) => o.id}
      columns={[
        { key: "when", header: "When", cellClassName: "text-muted-foreground tabular-nums", cell: (o) => when(o.created_at) },
        { key: "user", header: "Who" },
        { key: "question", header: "Question", cell: (o) => questionLabel(qid(o)) },
        { key: "answer", header: "New answer", cellClassName: "font-medium", cell: (o) => answerText(qid(o), o.new_answer) },
      ]}
    />
  );
}

export function RunsTable({ runs }: { runs: Run[] }) {
  if (!runs.length) return <Muted>Jev hasn&apos;t looked at this item yet.</Muted>;
  return (
    <DataTable
      label="Checks Jev ran"
      storageKey="item-runs"
      rows={runs}
      rowKey={(r) => r.id}
      columns={[
        {
          key: "run",
          header: "Run",
          cellClassName: "tabular-nums",
          cell: (r) => (
            <>
              #{r.id} <span className="text-muted-foreground">{r.trigger}</span>
              {r.error && <Status tone="danger" className="mt-1 max-w-72 items-start whitespace-normal">Run failed: {r.error}</Status>}
            </>
          ),
        },
        { key: "when", header: "When", cellClassName: "text-muted-foreground tabular-nums", cell: (r) => when(r.created_at) },
        { key: "model", header: "Model", cellClassName: mono, cell: (r) => <>{r.model_version} <span className="text-muted-foreground">{r.backend}</span></> },
        {
          key: "calibration",
          header: "Calibration",
          cell: (r) => (r.calibrated ? <Badge variant="success">Calibrated</Badge> : <Badge variant="warning" title="Probabilities from this backend are not calibrated.">Uncalibrated</Badge>),
        },
        { key: "latency", header: "Latency", align: "right", cellClassName: "tabular-nums", cell: (r) => `${r.latency_ms} ms` },
        { key: "tokens", header: "Tokens", align: "right", cellClassName: "tabular-nums", cell: (r) => r.tokens_in.toLocaleString("en-US") },
        { key: "cost", header: "Cost", align: "right", cellClassName: "tabular-nums", cell: (r) => `$${r.cost_usd.toFixed(4)}` },
      ]}
    />
  );
}
