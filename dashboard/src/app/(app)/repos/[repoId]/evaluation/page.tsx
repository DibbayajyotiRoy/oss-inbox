"use client";
import { ExternalLink, Play } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { BackfillCard, useBackfill } from "@/components/measure/backfill-card";
import { ConfusionMatrix } from "@/components/measure/confusion-matrix";
import { useRepo } from "@/components/repo";
import { useCommands } from "@/components/shell/commands";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CardSection } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { InfoHint } from "@/components/ui/info-hint";
import { InlineCode } from "@/components/ui/inline-code";
import { Load } from "@/components/ui/load";
import { Meter } from "@/components/ui/meter";
import { Notice } from "@/components/ui/notice";
import { PageHeader } from "@/components/ui/page-header";
import { Busy, Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { answers, fixed, pct, repoPath } from "@/lib/fmt";
import { type EvalQuestion, type Evaluation } from "@/lib/types";
import { questionLabel } from "@/lib/questions";
import { useApi } from "@/lib/use-api";

const skeleton = (
  <Busy className="flex flex-col gap-6">
    <Skeleton className="h-20 w-full" />
    <Skeleton className="h-64 w-full" />
    <Skeleton className="h-72 w-full" />
  </Busy>
);

export default function EvaluationPage() {
  const { repo, canAct } = useRepo();
  const res = useApi<Evaluation>(`/api/repos/${repo.id}/evaluation`);
  const bf = useBackfill(repo.id, res.data?.backfill_status ?? repo.backfill_status, res.reload);
  const thresholds = new Map(repo.questions.map((q) => [q.id, q.threshold]));
  useCommands([{ id: "backfill", label: "Check Jev on your past issues", group: "Repository", icon: Play, keywords: "backfill measure accuracy", run: () => canAct && !bf.active && bf.run() }]);

  return (
    <>
      <PageHeader title="Accuracy" description="How often Jev was right." />
      <div className="flex flex-col gap-6">
        <BackfillCard bf={bf} canAct={canAct} />
        <Load
          res={res}
          fallback={skeleton}
          isEmpty={(d) => d.questions.length === 0}
          empty={
            <EmptyState
              art="chart"
              title="No past answers yet"
              description={bf.active ? "Results appear as the check runs." : "Check Jev on your past issues first."}
              action={canAct && !bf.active ? <Button loading={bf.busy} onClick={bf.run}>Check Jev on your past issues</Button> : undefined}
            />
          }
        >
          {(d) => <Results d={d} repoId={repo.id} thresholds={thresholds} />}
        </Load>
      </div>
    </>
  );
}

function Results({ d, repoId, thresholds }: { d: Evaluation; repoId: number; thresholds: Map<string, number> }) {
  const sp = useSearchParams();
  const sel: EvalQuestion = d.questions.find((x) => x.id === sp.get("q")) ?? d.questions[0];
  const here = (qs: string) => `${repoPath(repoId, "evaluation")}?${qs}`;
  return (
    <>
      <Notice tone="warning" title="Probably a bit lower in real use.">
        <p className="text-pretty">
          Jev may have seen these public issues while it was trained, and closed issues are the easier ones. Your answers are the first labels a maintainer applied, so they can be wrong too. Learning mode measures new issues as they arrive.
        </p>
      </Notice>

      <CardSection title="Accuracy by question" hint="How often Jev matched your answers. The tick marks how sure Jev must be now.">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Question</TableHead>
              <TableHead>Right</TableHead>
              <TableHead className="max-sm:hidden">
                Average gap <InfoHint label="About the average gap">How far apart, on average, how sure Jev says it is and how often it is right. Lower is better.</InfoHint>
              </TableHead>
              <TableHead className="max-sm:hidden">Suggested</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {d.questions.map((x) => (
              <TableRow key={x.id} data-state={x.id === sel.id ? "selected" : undefined}>
                <TableCell className="py-3 align-middle">
                  <Link href={here(`q=${encodeURIComponent(x.id)}`)} scroll={false} aria-current={x.id === sel.id || undefined} className="text-[13px] font-medium underline-offset-4 link-grow max-sm:text-xs">
                    {questionLabel(x.id)}
                  </Link>
                  <span className="mt-0.5 block text-xs text-muted-foreground tabular-nums sm:hidden">Average gap {fixed(x.ece)} · suggested {pct(x.recommended_threshold)}</span>
                </TableCell>
                <TableCell className="py-3 align-middle">
                  <div className="flex flex-col items-start gap-1 sm:flex-row sm:items-center sm:gap-3">
                    <Meter value={x.accuracy} threshold={thresholds.get(x.id)} label="How often right" hideLabel className="w-44 max-sm:w-28" />
                    <span className="text-xs text-muted-foreground tabular-nums">out of {answers(x.n)}</span>
                  </div>
                </TableCell>
                <TableCell className="py-3 align-middle tabular-nums max-sm:hidden">
                  {fixed(x.ece)} <span className="text-xs text-muted-foreground">out of {answers(x.n)}</span>
                </TableCell>
                <TableCell className="py-3 align-middle tabular-nums max-sm:hidden">
                  {x.recommended_threshold === null ? (
                    <span className="text-muted-foreground">Needs more answers ({x.n.toLocaleString()} so far)</span>
                  ) : (
                    <>
                      {pct(x.recommended_threshold)} <span className="text-xs text-muted-foreground">now {pct(thresholds.get(x.id))} · </span>
                      <Link className="text-xs underline underline-offset-4 link-grow" href={`${repoPath(repoId, "thresholds")}?q=${encodeURIComponent(x.id)}`}>Adjust</Link>
                    </>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardSection>

      <Detail key={sel.id} x={sel} here={here} sp={sp} threshold={thresholds.get(sel.id)} />
    </>
  );
}

function Detail({ x, here, sp, threshold }: { x: EvalQuestion; here: (qs: string) => string; sp: URLSearchParams; threshold?: number }) {
  const num = (k: string) => (sp.get(k) === null ? undefined : Number(sp.get(k)));
  const lo = num("lo"), hi = num("hi"), truth = sp.get("truth"), answer = sp.get("answer");
  const filtered = lo !== undefined || hi !== undefined || truth !== null || answer !== null;
  const misses = x.worst_misses.filter(
    (m) => (lo === undefined || m.confidence >= lo) && (hi === undefined || hi >= 1 || m.confidence < hi) && (!truth || m.truth === truth) && (!answer || m.answer === answer),
  );
  const q = `q=${encodeURIComponent(x.id)}`;
  const chips = [
    lo !== undefined && `${pct(lo)}${hi !== undefined && hi < 1 ? ` to ${pct(hi)}` : " or more"} sure`,
    truth && `you said ${truth}`,
    answer && `Jev said ${answer}`,
  ].filter(Boolean);
  return (
    <>
      <CardSection
        title="Your answers against Jev's"
        description={`${questionLabel(x.id)} · ${answers(x.n)}`}
        hint="Rows are what you said, columns what Jev said. Shade is the share of the row. Click a wrong cell to see its items."
      >
        {x.confusion === null ? (
          <EmptyState className="py-6" art="chart" title="Nothing to compare yet" description={`${answers(x.n)} so far. Check Jev on your past issues.`} />
        ) : (
          <ConfusionMatrix
            labels={x.confusion.labels}
            matrix={x.confusion.matrix}
            href={(t, a) => here(`${q}&truth=${encodeURIComponent(t)}&answer=${encodeURIComponent(a)}`)}
            active={truth && answer ? { truth, answer } : undefined}
          />
        )}
      </CardSection>

      <CardSection
        title="Worst misses"
        description={`Wrong answers where Jev was most sure (up to ${x.worst_misses.length})`}
        hint="Items where Jev was wrong but very sure. The tick marks how sure Jev must be: past it, Jev would have acted by itself."
        action={filtered && <Button asChild variant="ghost" size="sm"><Link href={here(q)} scroll={false}>Clear filter</Link></Button>}
      >
        {filtered && (
          <p className="mb-3 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            Filtered by {chips.map((c) => <Badge key={String(c)} variant="outline">{c}</Badge>)}
          </p>
        )}
        {misses.length === 0 ? (
          <EmptyState
            className="py-6"
            art="done"
            title={x.worst_misses.length === 0 ? "No wrong answers recorded" : "None of the worst misses match"}
            description={x.worst_misses.length === 0 ? undefined : `Checked the ${x.worst_misses.length} worst misses.`}
          />
        ) : (
          <ul className="divide-y divide-border">
            {misses.map((m) => (
              <li key={m.item_id} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:gap-6">
                <div className="min-w-0 flex-1">
                  <Link href={`/items/${m.item_id}`} className="-my-0.5 inline-block max-w-full truncate py-0.5 align-top text-sm font-medium underline-offset-4 link-grow">
                    {m.number ? `#${m.number} ` : ""}<InlineCode text={m.title} />
                  </Link>
                  <p className="mt-1.5 flex flex-wrap items-center gap-x-1.5 text-xs text-muted-foreground">
                    Jev said <b className="font-medium text-foreground">{m.answer}</b> · you said <b className="font-medium text-foreground">{m.truth}</b>
                    {m.html_url && (
                      <a href={m.html_url} target="_blank" rel="noreferrer" className="-my-1 inline-flex items-center gap-0.5 py-1 underline-offset-4 hover:text-foreground link-grow">
                        GitHub <ExternalLink aria-hidden className="size-3" /><span className="sr-only">(opens in a new tab)</span>
                      </a>
                    )}
                  </p>
                </div>
                <Meter value={m.confidence} threshold={threshold} className="sm:w-56" />
              </li>
            ))}
          </ul>
        )}
      </CardSection>
    </>
  );
}
