"use client";
import Link from "next/link";
import { ReliabilityChart } from "@/components/measure/reliability-chart";
import { useRepo } from "@/components/repo";
import { Button } from "@/components/ui/button";
import { CardSection } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Load } from "@/components/ui/load";
import { PageHeader } from "@/components/ui/page-header";
import { Busy, Skeleton } from "@/components/ui/skeleton";
import { Stat, StatStrip } from "@/components/ui/stat-strip";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { fixed, pct, repoPath } from "@/lib/fmt";
import type { Calibration, QuestionInfo } from "@/lib/types";
import { useApi } from "@/lib/use-api";
import { cn } from "@/lib/utils";

export default function CalibrationPage() {
  const { repo } = useRepo();
  return (
    <>
      <PageHeader title="Calibration" description="Does stated confidence match reality?" />
      {repo.questions.length === 0 ? (
        <EmptyState art="chart" title="No questions yet" description="They appear once a feature has processed an item." />
      ) : (
        <ul className="grid gap-6 lg:grid-cols-2">
          {repo.questions.map((q) => (
            <li key={q.id} className="min-w-0">
              <QuestionCard repoId={repo.id} q={q} />
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

const skeleton = (
  <Busy className="flex flex-col gap-5">
    <Skeleton className="h-12 w-2/3" />
    <Skeleton className="aspect-[4/3] w-full" />
    <Skeleton className="h-40 w-full" />
  </Busy>
);

const range = (b: { lo: number; hi: number }) => `${Math.round(b.lo * 100)} to ${pct(b.hi)}`;

function QuestionCard({ repoId, q }: { repoId: number; q: QuestionInfo }) {
  const res = useApi<Calibration>(`/api/repos/${repoId}/calibration?question_id=${encodeURIComponent(q.id)}`);
  const evaluation = (lo: number, hi: number) => `${repoPath(repoId, "evaluation")}?q=${encodeURIComponent(q.id)}&lo=${lo}&hi=${hi}`;
  return (
    <CardSection
      title={<span className="font-mono">{q.id}</span>}
      description={q.feature}
      hint="Each dot is a confidence bucket: height is observed accuracy, size is n. Below the dashed line Jev is overconfident. Faint dots have fewer than 5 decisions. Click a dot for its misses."
    >
      <Load
        res={res}
        fallback={skeleton}
        isEmpty={(d) => d.n === 0}
        empty={
          <EmptyState
            className="py-6"
            art="chart"
            title="Not measured yet"
            description="n=0. Run a backfill to create ground truth."
            action={<Button asChild variant="outline" size="sm"><Link href={repoPath(repoId, "evaluation")}>Run backfill</Link></Button>}
          />
        }
      >
        {(d) => (
          <div className="flex flex-col gap-5">
            <StatStrip className="gap-x-6 border-t-0 pt-0 lg:grid-cols-2">
              <Stat label="ECE" hint="Expected calibration error: the average gap between confidence and accuracy. Lower is better." value={fixed(d.ece)} detail={`n=${d.n}`} />
              <Stat label="Accuracy" value={pct(q.accuracy, 1)} detail={`n=${q.n}`} />
            </StatStrip>
            <ReliabilityChart bins={d.bins} href={(b) => evaluation(b.lo, b.hi)} />
            <Table className="text-xs">
              <TableHeader>
                <TableRow>
                  <TableHead className="px-2">Confidence</TableHead>
                  <TableHead className="px-2 text-right">n</TableHead>
                  <TableHead className="px-2 text-right">Mean</TableHead>
                  <TableHead className="px-2 text-right">Accuracy</TableHead>
                  <TableHead className="px-2 text-right">Gap</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {d.bins.map((b) => {
                  const gap = b.accuracy === null || b.mean_confidence === null ? null : (b.accuracy - b.mean_confidence) * 100;
                  return (
                    <TableRow key={b.lo} className={cn(!b.n && "text-muted-foreground/50")}>
                      <TableCell className="px-2 py-2">
                        {b.n ? <Link className="underline-offset-4 hover:underline" href={evaluation(b.lo, b.hi)}>{range(b)}</Link> : range(b)}
                      </TableCell>
                      <TableCell className="px-2 py-2 text-right tabular-nums">{b.n}</TableCell>
                      <TableCell className="px-2 py-2 text-right tabular-nums">{pct(b.mean_confidence)}</TableCell>
                      <TableCell className="px-2 py-2 text-right tabular-nums">{pct(b.accuracy)}</TableCell>
                      <TableCell className={cn("px-2 py-2 text-right tabular-nums", b.n >= 5 && gap !== null && gap <= -5 && "text-destructive")}>
                        {gap === null ? "–" : `${gap >= 0 ? "+" : "−"}${Math.abs(gap).toFixed(0)} pts`}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </Load>
    </CardSection>
  );
}
