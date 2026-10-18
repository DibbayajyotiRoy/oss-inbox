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
import { answers, pct, repoPath, rightOf } from "@/lib/fmt";
import { featureName, type Evaluation, type QuestionInfo, type Repo } from "@/lib/types";
import { questionLabel } from "@/lib/questions";
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
        <PageHeader title="How sure Jev must be" />
        <EmptyState art="chart" title="Nothing to set yet" description="These appear after Jev handles its first item." />
      </>
    );
  const ev = evaluation.data?.questions.find((x) => x.id === q.id);
  return (
    <>
      <PageHeader
        title="How sure Jev must be"
        description="Try each level on your past answers."
        actions={
          changes.length > 0 && (
            <Button asChild variant="outline" size="sm">
              <a href="#pending">{changes.length} unsaved</a>
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
          <option key={q.id} value={q.id}>{questionLabel(q.id)} · {pct(value(q))}</option>
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
                    <span className="min-w-0 flex-1 truncate text-[13px] font-medium">{questionLabel(q.id)}</span>
                    {edited(q) && <span className="size-1.5 rounded-full bg-warning"><span className="sr-only">changed</span></span>}
                    <span className="text-[13px] font-medium tabular-nums">{pct(value(q))}</span>
                  </span>
                  <span className="mt-0.5 block truncate text-xs text-muted-foreground">{featureName(q.feature)} · default {pct(q.default_threshold)}</span>
                  <span className="mt-1.5 flex items-center justify-between gap-2 text-xs text-muted-foreground">
                    <span className="tabular-nums">{q.accuracy == null ? "No answers yet" : `${pct(q.accuracy, 1)} right, ${answers(q.n)}`}</span>
                    <Badge variant={q.measured ? "outline" : "warning"}>{q.measured ? "Ready to act" : "Not ready yet"}</Badge>
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
      title={questionLabel(q.id)}
      hint="Drag the line, or use the arrow keys (Shift for 5 points). Counts come from your past answers for this repo."
      description={
        <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <Badge variant="outline">{featureName(q.feature)}</Badge>
          <span className="tabular-nums">{q.accuracy == null ? `No answers yet` : `Jev was ${rightOf(q.accuracy, q.n, 1)}`}</span>
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
        {!q.measured && <Status tone="warning">Not ready yet. Jev will not act on its own here.</Status>}
        {!repo.calibrated && <Status tone="warning">The model&apos;s sure-scores are only a ranking, not real odds.</Status>}
        {res.error ? (
          <ErrorState error={res.error} retry={res.reload} />
        ) : empty ? (
          <EmptyState
            art="chart"
            title="No past answers yet"
            description="Check Jev on your past issues first."
            action={<Button asChild variant="outline"><Link href={repoPath(repo.id, "evaluation")}>Check Jev on your past issues</Link></Button>}
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
  const labeled = c.acted - c.unmeasured; // acted on its own, and you gave an answer
  const [peek, setPeek] = useState(false); // hovering or focusing "Use recommended" lights its line on the chart
  const roll = (n: number, cls?: string) => <span className="text-3xl sm:text-4xl"><NumberTicker value={n} locale animateOnMount={false} duration={0.4} className={cls} /></span>;
  return (
    <>
      <div>
        <ul className="mb-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
          <li className="flex items-center gap-1.5"><i className="size-2 rounded-[2px] bg-chart-wrong" />Wrong</li>
          <li className="flex items-center gap-1.5"><i className="size-2 rounded-[2px] bg-chart-acted" />Right</li>
          <li className="flex items-center gap-1.5"><i className="size-2 rounded-[2px] bg-chart-unlabeled" />No answer yet</li>
          <li className="flex items-center gap-1.5"><i className="h-3 w-0.5 rounded-full bg-tick" />Must be this sure</li>
          {recommended != null && <li className="flex items-center gap-1.5"><i className="h-3 w-0 border-l-2 border-dashed border-chart-1" />Recommended {pct(recommended)}</li>}
        </ul>
        <ThresholdChart bins={bins} value={value} onChange={onChange} recommended={recommended} peek={peek} label={`How sure Jev must be for ${questionLabel(q.id)}`} describedBy={reading} />
      </div>

      <StatStrip className="grid-cols-3 gap-x-4 sm:gap-x-8 lg:grid-cols-3">
        <Stat
          label={<span className="inline-flex items-center gap-1.5"><i className="size-2 rounded-[2px] bg-chart-acted" />Jev acts</span>}
          value={roll(c.acted)}
          detail={`${pct(c.acted / c.n)} of ${c.n.toLocaleString()}`}
        />
        <Stat
          label={<span className="inline-flex items-center gap-1.5"><i className="size-2 rounded-[2px] bg-chart-queued" />Needs review</span>}
          value={roll(c.queued)}
          detail={`${pct(c.queued / c.n)} of ${c.n.toLocaleString()}`}
        />
        <Stat
          label={<span className="inline-flex items-center gap-1.5"><i className="size-2 rounded-[2px] bg-chart-wrong" /><span className="sm:hidden">Wrong</span><span className="max-sm:hidden">Would be wrong</span></span>}
          hint="Times Jev would have acted and your answer was different."
          value={roll(c.wrong, c.wrong > 0 ? "text-destructive" : undefined)}
          detail={`of ${labeled.toLocaleString()} with your answer`}
        />
      </StatStrip>

      <p id={reading} className="text-sm text-pretty">
        {c.acted === 0 ? (
          <>At {pct(value)} sure, Jev would not act on anything by itself. All <b className="tabular-nums">{c.n.toLocaleString()}</b> would need review.</>
        ) : labeled === 0 ? (
          <>At {pct(value)} sure, Jev would act on <b className="tabular-nums">{c.acted.toLocaleString()}</b> by itself. None have your answer yet.</>
        ) : (
          <>
            At {pct(value)} sure, Jev would have been wrong <b className="tabular-nums">{c.wrong.toLocaleString()}</b> of <b className="tabular-nums">{labeled.toLocaleString()}</b> times it acted by itself and you gave an answer
            ({pct(1 - c.wrong / labeled, 1)} right).
            {c.wrong > 0 && (
              <> <Link className="underline underline-offset-4 link-grow" href={`${repoPath(repoId, "evaluation")}?q=${encodeURIComponent(q.id)}&lo=${value}`}>See them</Link>.</>
            )}
            {c.unmeasured > 0 && <> {c.unmeasured.toLocaleString()} more have no answer from you yet.</>}
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
          {recommended != null ? `Recommended keeps wrong answers under 5%${evalN ? `, out of ${answers(evalN)}` : ""}.` : "Not enough past answers to recommend one."}
        </p>
      </div>
    </>
  );
}
