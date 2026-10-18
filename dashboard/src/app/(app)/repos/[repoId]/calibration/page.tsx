"use client";
import { ChevronRight } from "lucide-react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { LOW_N, ReliabilitySpark } from "@/components/measure/reliability-spark";
import { useRepo } from "@/components/repo";
import { Button } from "@/components/ui/button";
import { CardSection } from "@/components/ui/card";
import { DataTable } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/empty-state";
import { Load } from "@/components/ui/load";
import { PageHeader } from "@/components/ui/page-header";
import { Select } from "@/components/ui/select";
import { Busy, Skeleton } from "@/components/ui/skeleton";
import { Stat, StatStrip } from "@/components/ui/stat-strip";
import { answers, fixed, pct, repoPath } from "@/lib/fmt";
import { featureName, type Calibration, type EvalQuestion, type Evaluation } from "@/lib/types";
import { questionLabel } from "@/lib/questions";
import { useApi } from "@/lib/use-api";
import { cn } from "@/lib/utils";

// Recharts and the Evil composed chart load on demand (a Detail starts the fetch as it mounts, beside its data); the skeleton has the chart's aspect ratio, so nothing shifts.
const loadChart = () => import("@/components/measure/reliability-chart").then((m) => m.ReliabilityChart);
const ReliabilityChart = dynamic(loadChart, {
  ssr: false,
  loading: () => <Skeleton className="aspect-[3/2] w-full" />,
});

const skeleton = (
  <Busy className="grid gap-6 lg:grid-cols-[22rem_minmax(0,1fr)]">
    <Skeleton className="h-96 w-full" />
    <Skeleton className="h-[34rem] w-full" />
  </Busy>
);

const bins = (repoId: number, id: string) => `/api/repos/${repoId}/calibration?question_id=${encodeURIComponent(id)}`;
const gap = (b: Calibration["bins"][number]) => (b.accuracy === null || b.mean_confidence === null ? null : (b.accuracy - b.mean_confidence) * 100);
const range = (b: { lo: number; hi: number }) => `${Math.round(b.lo * 100)} to ${pct(b.hi)}`;

export default function CalibrationPage() {
  const { repo } = useRepo();
  const res = useApi<Evaluation>(`/api/repos/${repo.id}/evaluation`);
  return (
    <>
      <PageHeader title="Honesty check" description="Is Jev honest about how sure it is?" />
      <Load
        res={res}
        fallback={skeleton}
        isEmpty={(d) => d.questions.length === 0}
        empty={
          <EmptyState
            art="chart"
            title="Not checked yet"
            description="Check Jev on your past issues first."
            action={<Button asChild variant="outline"><Link href={repoPath(repo.id, "evaluation")}>Check Jev on your past issues</Link></Button>}
          />
        }
      >
        {(d) => <Overview repoId={repo.id} questions={[...d.questions].sort((a, b) => (b.ece ?? -1) - (a.ece ?? -1))} />}
      </Load>
    </>
  );
}

/** Every question, biggest gap first, with the selected one in detail beside it. */
function Overview({ repoId, questions }: { repoId: number; questions: EvalQuestion[] }) {
  const { repo } = useRepo();
  const sp = useSearchParams();
  const [sel, setSel] = useState(() => questions.find((x) => x.id === sp.get("q"))?.id ?? questions[0].id);
  const feature = new Map(repo.questions.map((q) => [q.id, q.feature]));
  const x = questions.find((q) => q.id === sel) ?? questions[0];
  function pick(id: string) {
    setSel(id);
    window.history.replaceState(null, "", `?q=${encodeURIComponent(id)}`);
  }
  return (
    <div className="grid gap-6 lg:grid-cols-[22rem_minmax(0,1fr)] lg:items-start">
      <Select wrapperClassName="lg:hidden" aria-label="Question" value={sel} onValueChange={pick}>
        {questions.map((q) => (
          <option key={q.id} value={q.id}>{questionLabel(q.id)} · average gap {fixed(q.ece)} · {answers(q.n)}</option>
        ))}
      </Select>
      <nav aria-label="Questions, biggest gap first" className="hidden lg:sticky lg:top-0 lg:block lg:max-h-[calc(100dvh-10rem)] lg:overflow-y-auto">
        <p className="px-3 pb-1.5 text-xs text-muted-foreground">Biggest gap first</p>
        <ul className="flex flex-col gap-1">
          {questions.map((q) => (
            <li key={q.id}>
              <Row repoId={repoId} q={q} feature={feature.get(q.id)} on={q.id === x.id} onPick={() => pick(q.id)} />
            </li>
          ))}
        </ul>
      </nav>
      <Detail key={x.id} repoId={repoId} x={x} feature={feature.get(x.id)} />
    </div>
  );
}

function Row({ repoId, q, feature, on, onPick }: { repoId: number; q: EvalQuestion; feature?: string; on: boolean; onPick: () => void }) {
  const res = useApi<Calibration>(q.n ? bins(repoId, q.id) : null);
  return (
    <button
      type="button"
      aria-current={on || undefined}
      onClick={onPick}
      className={cn(
        "hover-pill relative grid w-full grid-cols-[minmax(0,1fr)_auto_3.25rem] items-center gap-3 rounded-lg px-3 py-2 text-left ring-1 ring-transparent outline-none ring-inset [--pill-from:0.96] focus-visible:ring-ring motion-safe:transition-[background-color,box-shadow] motion-safe:duration-150 motion-safe:ease-settle",
        on && "bg-accent ring-border",
      )}
    >
      <span className="min-w-0">
        <span className="block truncate text-[13px] font-medium">{questionLabel(q.id)}</span>
        <span className="block truncate text-xs text-muted-foreground tabular-nums">{feature ? `${featureName(feature)} · ` : ""}{answers(q.n)}</span>
      </span>
      {res.data ? <ReliabilitySpark bins={res.data.bins} /> : res.error || !q.n ? <span className="size-8" /> : <Skeleton className="size-8" />}
      <span className="text-right">
        <span className="block text-[13px] font-medium tabular-nums">{fixed(q.ece)}</span>
        <span className="block text-xs text-muted-foreground">gap</span>
      </span>
    </button>
  );
}

function Detail({ repoId, x, feature }: { repoId: number; x: EvalQuestion; feature?: string }) {
  const res = useApi<Calibration>(bins(repoId, x.id));
  useEffect(() => void loadChart(), []);
  const evaluation = (lo: number, hi: number) => `${repoPath(repoId, "evaluation")}?q=${encodeURIComponent(x.id)}&lo=${lo}&hi=${hi}`;
  return (
    <CardSection
      title={questionLabel(x.id)}
      description={feature && featureName(feature)}
      hint="Each dot is a group of answers where Jev was about equally sure. Height is how often it was right. Size is how many answers. Below the dashed line, Jev is more sure than it should be. Hollow dots have fewer than 5 answers. Click a dot to see the misses."
    >
      <Load
        res={res}
        fallback={<Busy className="flex flex-col gap-5"><Skeleton className="h-16 w-2/3" /><Skeleton className="aspect-[3/2] w-full" /></Busy>}
        isEmpty={(d) => d.n === 0}
        empty={<EmptyState className="py-6" art="chart" title="Not checked yet" description="No answers yet. Check Jev on your past issues first." />}
      >
        {(d) => {
          const trusted = d.bins.filter((b) => b.n >= LOW_N);
          const over = trusted.map((b) => -(gap(b) ?? 0)).filter((pts) => pts >= 5); // points of overconfidence
          const seen = d.bins.filter((b) => b.n > 0);
          return (
            <div className="flex flex-col gap-5">
              <StatStrip className="gap-x-6 border-t-0 pt-0 lg:grid-cols-2">
                <Stat label="Average gap" hint="The average gap between how sure Jev says it is and how often it is right. Lower is better." value={fixed(d.ece)} detail={answers(d.n)} />
                <Stat label="How often right" value={pct(x.accuracy, 1)} detail={answers(x.n)} />
              </StatStrip>
              <p className="text-sm text-pretty">
                {trusted.length === 0
                  ? `No group has ${LOW_N} or more answers yet.`
                  : over.length === 0
                    ? `Jev is never too sure in the ${trusted.length} groups with ${LOW_N}+ answers.`
                    : `Jev is too sure in ${over.length} of ${trusted.length} groups with ${LOW_N}+ answers, by up to ${Math.round(Math.max(...over))} points.`}
              </p>
              <div>
                <ReliabilityChart bins={d.bins} href={(b) => evaluation(b.lo, b.hi)} />
                <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                  <li className="flex items-center gap-1.5"><i className="size-2.5 rounded-full bg-chart-1" />{LOW_N}+ answers</li>
                  <li className="flex items-center gap-1.5"><i className="size-2.5 rounded-full border-[1.5px] border-chart-unlabeled" />Fewer than {LOW_N}</li>
                  <li className="flex items-center gap-1.5"><i className="w-4 border-t border-dashed border-chart-unlabeled" />Perfectly honest</li>
                </ul>
              </div>
              <details className="group">
                <summary className="flex w-fit cursor-pointer list-none items-center gap-2 rounded-md text-sm text-muted-foreground outline-none select-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
                  <ChevronRight aria-hidden className="size-4 motion-safe:transition-transform motion-safe:duration-150 group-open:rotate-90" />
                  Groups <span className="tabular-nums">({seen.length} with answers)</span>
                </summary>
                <DataTable
                  className="mt-3"
                  label="Groups by how sure Jev was"
                  storageKey="calibration-groups"
                  rows={seen}
                  rowKey={(b) => b.lo}
                  columns={[
                    { key: "range", header: "How sure", cell: (b) => <Link className="underline-offset-4 link-grow" href={evaluation(b.lo, b.hi)}>{range(b)}</Link> },
                    { key: "n", header: "Answers", align: "right", cellClassName: "tabular-nums" },
                    { key: "mean", header: "Average sure", align: "right", cellClassName: "tabular-nums", cell: (b) => pct(b.mean_confidence) },
                    { key: "right", header: "Right", align: "right", cellClassName: "tabular-nums", cell: (b) => pct(b.accuracy) },
                    {
                      key: "gap",
                      header: "Gap",
                      align: "right",
                      cellClassName: "tabular-nums",
                      cell: (b) => {
                        const g = gap(b);
                        return (
                          <span className={cn(b.n >= LOW_N && g !== null && g <= -5 && "text-destructive")}>
                            {g === null ? "–" : `${g >= 0 ? "+" : "−"}${Math.abs(g).toFixed(0)} points`}
                          </span>
                        );
                      },
                    },
                  ]}
                />
              </details>
            </div>
          );
        }}
      </Load>
    </CardSection>
  );
}
