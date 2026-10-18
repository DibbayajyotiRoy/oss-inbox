"use client";
import { RotateCcw } from "lucide-react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useId, useState } from "react";
import { snap, type Bin } from "@/components/measure/threshold-scale";
import { useRepo } from "@/components/repo";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CardSection } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/load";
import { NumberTicker } from "@/components/ui/number-ticker";
import { PageHeader } from "@/components/ui/page-header";
import { FadePresence } from "@/components/ui/presence";
import { Select } from "@/components/ui/select";
import { Busy, Skeleton } from "@/components/ui/skeleton";
import { Stat, StatStrip } from "@/components/ui/stat-strip";
import { Status } from "@/components/ui/status";
import { pct, repoPath } from "@/lib/fmt";
import type { Evaluation, QuestionInfo, Repo } from "@/lib/types";
import { useApi } from "@/lib/use-api";
import { cn } from "@/lib/utils";
import { PendingTray, type Change } from "./pending-tray";
import type { Counts } from "./preview.worker";
import { usePreview } from "./use-preview";

const same = (a: number, b: number) => Math.abs(a - b) < 0.0005;

// Recharts + the Evil area chart load on demand (a Panel starts the fetch as it mounts, beside its data); the skeleton has the chart's exact height, so nothing shifts.
const loadChart = () => import("@/components/measure/threshold-chart").then((m) => m.ThresholdChart);
const ThresholdChart = dynamic(loadChart, {
  ssr: false,
  loading: () => <Skeleton className="h-64 w-full" />,
});

export default function Thresholds() {
  const { repo } = useRepo();
  const sp = useSearchParams();
  const [sel, setSel] = useState(() => repo.questions.find((q) => q.id === sp.get("q"))?.id ?? repo.questions[0]?.id);
  const [vals, setVals] = useState<Record<string, number>>({});
  const evaluation = useApi<Evaluation>(`/api/repos/${repo.id}/evaluation`); // only for the recommended threshold
  const value = (q: QuestionInfo) => vals[q.id] ?? q.threshold;
  const edited = (q: QuestionInfo) => !same(value(q), q.threshold);
  const changes: Change[] = repo.questions.filter(edited).map((q) => ({ id: q.id, from: q.threshold, to: value(q), isDefault: same(value(q), q.default_threshold) }));
  const q = repo.questions.find((x) => x.id === sel);
  const set = useCallback((id: string, v: number | undefined) => setVals((s) => ({ ...s, [id]: v as number })), []);

  function pick(id: string) {
    setSel(id);
    window.history.replaceState(null, "", `?q=${encodeURIComponent(id)}`);
  }

  if (!q)
    return (
      <>
        <PageHeader title="Thresholds" />
        <EmptyState art="chart" title="No questions yet" description="They appear once a feature has processed an item." />
      </>
    );
  const ev = evaluation.data?.questions.find((x) => x.id === q.id);
  return (
    <>
      <PageHeader
        title="Thresholds"
        description="Preview each threshold on measured history."
        actions={
          changes.length > 0 && (
            <Button asChild variant="outline" size="sm">
              <a href="#pending">{changes.length} pending</a>
            </Button>
          )
        }
      />
      <div className="grid gap-6 lg:grid-cols-[17rem_minmax(0,1fr)] lg:items-start">
        <Picker questions={repo.questions} sel={q.id} onPick={pick} value={value} edited={edited} />
        <div className="flex min-w-0 flex-col gap-6">
          <Panel
            key={q.id}
            repo={repo}
            q={q}
            value={value(q)}
            edited={edited(q)}
            recommended={ev?.recommended_threshold ?? null}
            evalN={ev?.n}
            set={set}
          />
          <FadePresence show={changes.length > 0} mode="collapse">
            <PendingTray repoId={repo.id} changes={changes} onUndo={(id) => set(id, undefined)} onClear={() => setVals({})} />
          </FadePresence>
        </div>
      </div>
    </>
  );
}

function Picker({ questions, sel, onPick, value, edited }: {
  questions: QuestionInfo[]; sel: string; onPick: (id: string) => void; value: (q: QuestionInfo) => number; edited: (q: QuestionInfo) => boolean;
}) {
  return (
    <>
      <Select wrapperClassName="lg:hidden" aria-label="Question" value={sel} onValueChange={onPick}>
        {questions.map((q) => (
          <option key={q.id} value={q.id}>{q.id} · {pct(value(q))}</option>
        ))}
      </Select>
      <nav aria-label="Questions" className="hidden lg:sticky lg:top-0 lg:block lg:max-h-[calc(100dvh-10rem)] lg:overflow-y-auto">
        <ul className="flex flex-col gap-1">
          {questions.map((q) => {
            const on = q.id === sel;
            return (
              <li key={q.id}>
                <button
                  type="button"
                  aria-current={on || undefined}
                  onClick={() => onPick(q.id)}
                  className={cn(
                    "hover-pill relative w-full rounded-lg px-3 py-2.5 text-left ring-1 ring-transparent outline-none ring-inset [--pill-from:0.96] focus-visible:ring-ring motion-safe:transition-[background-color,box-shadow] motion-safe:duration-150 motion-safe:ease-settle",
                    on && "bg-accent ring-border",
                  )}
                >
                  <span className="flex items-center gap-2">
                    <span className="min-w-0 flex-1 truncate font-mono text-[13px] font-medium">{q.id}</span>
                    {edited(q) && <span className="size-1.5 rounded-full bg-warning"><span className="sr-only">edited</span></span>}
                    <span className="text-[13px] font-medium tabular-nums">{pct(value(q))}</span>
                  </span>
                  <span className="mt-0.5 block truncate text-xs text-muted-foreground">{q.feature} · default {pct(q.default_threshold)}</span>
                  <span className="mt-1.5 flex items-center justify-between gap-2 text-xs text-muted-foreground">
                    <span className="tabular-nums">{pct(q.accuracy, 1)} · n={q.n}</span>
                    <Badge variant={q.measured ? "outline" : "warning"}>{q.measured ? "Measured" : "Not measured"}</Badge>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </nav>
    </>
  );
}

function Panel({ repo, q, value, edited, recommended, evalN, set }: {
  repo: Repo; q: QuestionInfo; value: number; edited: boolean; recommended: number | null; evalN?: number; set: (id: string, v: number) => void;
}) {
  const onChange = useCallback((v: number) => set(q.id, v), [set, q.id]);
  const { res, empty, bins, counts } = usePreview(repo.id, q.id, value);
  const reading = useId();
  useEffect(() => void loadChart(), []);
  return (
    <CardSection
      title={<span className="font-mono">{q.id}</span>}
      hint="Drag the tick, or focus it and use the arrow keys (Shift for 5 points). Counts come from this repo's labeled history."
      description={
        <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <Badge variant="outline">{q.feature}</Badge>
          <span className="tabular-nums">{q.measured ? `Accuracy ${pct(q.accuracy, 1)}, n=${q.n}` : `Not measured, n=${q.n}`}</span>
        </span>
      }
      action={
        <div className="text-right">
          <div className="text-3xl leading-none font-semibold tracking-tight">
            <NumberTicker value={Math.round(value * 100)} suffix="%" animateOnMount={false} duration={0.4} />
          </div>
          <p className="mt-1.5 text-xs whitespace-nowrap text-muted-foreground tabular-nums">{edited ? `was ${pct(q.threshold)} · ` : ""}default {pct(q.default_threshold)}</p>
        </div>
      }
    >
      <div className="flex flex-col gap-5">
        {!q.measured && <Status tone="warning">Not measured yet: auto mode will not act on this question.</Status>}
        {!repo.calibrated && <Status tone="warning">Uncalibrated backend: confidence is a ranking, not a probability.</Status>}
        {res.error ? (
          <ErrorState error={res.error} retry={res.reload} />
        ) : empty ? (
          <EmptyState
            art="chart"
            title="No labeled history yet"
            description="Run a backfill to measure this question."
            action={<Button asChild variant="outline"><Link href={repoPath(repo.id, "evaluation")}>Run backfill</Link></Button>}
          />
        ) : !bins || !counts ? (
          <Busy><Skeleton className="h-[26rem] w-full" /></Busy>
        ) : (
          <Body repoId={repo.id} q={q} value={value} edited={edited} recommended={recommended} evalN={evalN} bins={bins} counts={counts} onChange={onChange} reading={reading} />
        )}
      </div>
    </CardSection>
  );
}

function Body({ repoId, q, value, edited, recommended, evalN, bins, counts: c, onChange, reading }: {
  repoId: number; q: QuestionInfo; value: number; edited: boolean; recommended: number | null; evalN?: number; reading: string;
  bins: Bin[]; counts: Counts; onChange: (v: number) => void;
}) {
  const labeled = c.acted - c.unmeasured; // auto-acted with a known answer
  const [peek, setPeek] = useState(false); // hovering or focusing "Use recommended" lights its line on the chart
  const roll = (n: number, cls?: string) => <span className={cn("text-3xl sm:text-4xl", cls)}><NumberTicker value={n} locale animateOnMount={false} duration={0.4} /></span>;
  return (
    <>
      <div>
        <ul className="mb-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
          <li className="flex items-center gap-1.5"><i className="size-2 rounded-[2px] bg-destructive" />Wrong</li>
          <li className="flex items-center gap-1.5"><i className="size-2 rounded-[2px] bg-muted-foreground" />Correct</li>
          <li className="flex items-center gap-1.5"><i className="size-2 rounded-[2px] bg-chart-4" />Unlabeled</li>
          <li className="flex items-center gap-1.5"><i className="h-3 w-0.5 rounded-full bg-warning" />Threshold</li>
          {recommended != null && <li className="flex items-center gap-1.5"><i className="h-3 w-0 border-l-2 border-dashed border-warning/70" />Recommended {pct(recommended)}</li>}
        </ul>
        <ThresholdChart bins={bins} value={value} onChange={onChange} recommended={recommended} peek={peek} label={`Threshold for ${q.id}`} describedBy={reading} />
      </div>

      <StatStrip className="grid-cols-3 gap-x-4 sm:gap-x-8 lg:grid-cols-3">
        <Stat
          label={<span className="inline-flex items-center gap-1.5"><i className="size-2 rounded-[2px] bg-foreground" />Auto-acted</span>}
          value={roll(c.acted)}
          detail={`${pct(c.acted / c.n)} of ${c.n.toLocaleString()}`}
        />
        <Stat
          label={<span className="inline-flex items-center gap-1.5"><i className="size-2 rounded-[2px] bg-muted-foreground" />Queued</span>}
          value={roll(c.queued)}
          detail={`${pct(c.queued / c.n)} of ${c.n.toLocaleString()}`}
        />
        <Stat
          label={<span className="inline-flex items-center gap-1.5"><i className="size-2 rounded-[2px] bg-destructive" /><span className="sm:hidden">Wrong</span><span className="max-sm:hidden">Would be wrong</span></span>}
          hint="Auto-acted decisions whose known answer differs from Jev's."
          value={roll(c.wrong, c.wrong > 0 ? "text-destructive" : undefined)}
          detail={`of ${labeled.toLocaleString()} with a known answer`}
        />
      </StatStrip>

      <p id={reading} className="text-sm text-pretty">
        {c.acted === 0 ? (
          <>At {pct(value)} nothing would be auto-acted. All <b className="tabular-nums">{c.n.toLocaleString()}</b> would be queued.</>
        ) : labeled === 0 ? (
          <>At {pct(value)}, <b className="tabular-nums">{c.acted.toLocaleString()}</b> would be auto-acted, none with a known answer yet.</>
        ) : (
          <>
            At {pct(value)} it would have been wrong <b className="tabular-nums">{c.wrong.toLocaleString()}</b> of <b className="tabular-nums">{labeled.toLocaleString()}</b> times it acted on a known answer
            ({pct(1 - c.wrong / labeled, 1)} accurate).
            {c.wrong > 0 && (
              <> <Link className="underline underline-offset-4 link-grow" href={`${repoPath(repoId, "evaluation")}?q=${encodeURIComponent(q.id)}&lo=${value}`}>See them</Link>.</>
            )}
            {c.unmeasured > 0 && <> {c.unmeasured.toLocaleString()} more have no known answer.</>}
          </>
        )}
      </p>

      <div className="flex flex-wrap items-center gap-2 border-t border-border pt-5">
        <Button
          variant="outline"
          size="sm"
          disabled={recommended == null || same(value, recommended)}
          onPointerEnter={() => setPeek(true)}
          onPointerLeave={() => setPeek(false)}
          onFocus={() => setPeek(true)}
          onBlur={() => setPeek(false)}
          onClick={() => {
            setPeek(false);
            if (recommended != null) onChange(snap(recommended));
          }}
        >
          Use recommended{recommended != null && ` ${pct(recommended)}`}
        </Button>
        <Button variant="ghost" size="sm" disabled={same(value, q.default_threshold)} onClick={() => onChange(snap(q.default_threshold))}>
          <RotateCcw aria-hidden /> Reset to default
        </Button>
        {edited && (
          <Button variant="ghost" size="sm" onClick={() => onChange(q.threshold)}>
            Undo
          </Button>
        )}
        <p className="text-xs text-muted-foreground sm:ml-auto">
          {recommended != null ? `Recommended keeps wrong answers under 5%${evalN ? `, n=${evalN}` : ""}.` : "Not enough labeled history to recommend."}
        </p>
      </div>
    </>
  );
}
