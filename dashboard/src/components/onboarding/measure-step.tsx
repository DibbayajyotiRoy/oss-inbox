"use client";

import { useEffect, useState } from "react";
import { Play } from "lucide-react";
import { InfoHint } from "@/components/ui/info-hint";
import { Meter } from "@/components/ui/meter";
import { NumberTicker } from "@/components/ui/number-ticker";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Status } from "@/components/ui/status";
import { ErrorState } from "@/components/ui/load";
import { toast } from "@/components/ui/toaster";
import { api } from "@/lib/api";
import { pct } from "@/lib/fmt";
import type { Backfill, Repo } from "@/lib/types";
import { useAction } from "@/lib/use-api";
import { Continue, Primary, useFlow, useInterval } from "./flow";
import { SettleMeter } from "./parts";

const PREVIEW = ["issue.type", "priority", "route.area", "spam"]; // what a backfill can measure

/**
 * The onboarding signature. Run the backfill, watch the processed count roll, and see each question's accuracy
 * settle in against its threshold as the comparison completes. Always labelled an upper bound, always with n.
 */
export function MeasureStep({ repo, reload }: { repo: Repo; reload: () => void }) {
  const [b, setB] = useState<Backfill>();
  const [error, setError] = useState<Error>();
  const act = useAction();
  const { next } = useFlow();
  const path = `/api/repos/${repo.id}/backfill`;
  const load = () => api<Backfill>(path).then(setB, (e) => setError(e));
  useEffect(() => {
    void api<Backfill>(path).then(setB, (e) => setError(e));
  }, [path]);

  const live = b?.status === "queued" || b?.status === "running";
  useInterval(load, live ? 1000 : null);
  // Question stats are cached for a minute server-side, so keep looking a little after the run ends.
  useInterval(() => {
    if (live || Date.now() - Date.parse(b?.finished_at ?? "") < 70_000) reload();
  }, b && b.status !== "idle" ? 3000 : null);

  if (!b)
    return error ? (
      <ErrorState
        error={error}
        retry={() => {
          setError(undefined);
          void load();
        }}
      />
    ) : (
      <Skeleton className="h-40 w-full" />
    );
  const rows = repo.questions.filter((q) => q.n > 0);
  const start = () =>
    act.run(async () => {
      await api(path, { method: "POST" });
      const now = await api<Backfill>(path);
      setB(now);
      if (now.status === "idle") toast.info("Backfill not started", { description: "Demo mode has no worker. Open a seeded repository to see results." });
    });

  return (
    <div className="flex flex-col gap-8">
      <Reading b={b} />
      {act.error ? (
        <p role="alert" className="-mt-4 text-sm text-destructive">
          {act.error.message}
        </p>
      ) : null}

      {b.status === "idle" ? (
        <div className="flex flex-col gap-4" aria-label="Preview of the accuracy readings">
          <p className="text-sm font-medium">Accuracy by question</p>
          <div className="grid gap-x-10 gap-y-6 sm:grid-cols-2">
            {repo.questions
              .filter((q) => PREVIEW.includes(q.id))
              .map((q) => (
                <Meter key={q.id} size="md" value={null} threshold={q.threshold} label={q.id} />
              ))}
          </div>
          <p className="text-xs text-muted-foreground">Each fills in as items are compared, with its sample size.</p>
        </div>
      ) : (
        <section aria-labelledby="acc" className="flex flex-col gap-4">
          <div className="flex items-center justify-between gap-3">
            <h2 id="acc" className="inline-flex items-center gap-1.5 text-sm font-medium">
              Accuracy by question
              <InfoHint label="About backfill accuracy">
                An upper bound. The model may have seen these public issues in training, and closed work is a survivor sample. Truth is the first
                label a maintainer applied. Expect live accuracy to be lower; shadow mode measures it on new items.
              </InfoHint>
            </h2>
            <span className="text-xs text-muted-foreground">Upper bound</span>
          </div>
          {rows.length > 0 ? (
            <div className="grid gap-x-10 gap-y-6 sm:grid-cols-2">
              {rows.map((q, i) => (
                <SettleMeter key={q.id} i={i} value={q.accuracy} threshold={q.threshold} label={q.id} valueText={`${pct(q.accuracy)} · n=${q.n.toLocaleString()}${q.measured ? "" : " (low)"}`} />
              ))}
            </div>
          ) : b.status === "done" ? (
            <p className="text-sm text-muted-foreground">No past labels matched, so nothing is measured yet. Shadow mode will measure live items.</p>
          ) : (
            <div role="status" className="grid gap-x-10 gap-y-6 sm:grid-cols-2">
              <Skeleton className="h-9" />
              <Skeleton className="h-9" />
              <span className="sr-only">Accuracy appears as items are compared</span>
            </div>
          )}
          {rows.length > 0 ? <p className="text-xs text-muted-foreground">Live accuracy will be lower. Questions without past labels stay unmeasured.</p> : null}
        </section>
      )}

      {b.status === "done" ? (
        <Continue />
      ) : live ? (
        <>
          <Primary variant="ghost" onClick={next}>
            Continue without waiting
          </Primary>
          <Primary disabled loading>
            Measuring
          </Primary>
        </>
      ) : (
        <Primary loading={act.busy} onClick={start}>
          <Play />
          {b.status === "error" ? "Retry backfill" : "Run backfill"}
        </Primary>
      )}
    </div>
  );
}

function Reading({ b }: { b: Backfill }) {
  if (b.status === "idle")
    return (
      <p className="max-w-[60ch] text-sm text-muted-foreground">
        Jev replays your closed issues and merged PRs without acting, then compares its answers with the labels your maintainers applied. It runs on
        the server, so you can leave this page.
      </p>
    );
  if (b.status === "error")
    return (
      <div role="alert" className="flex flex-col gap-1 rounded-lg border border-destructive/40 bg-destructive/5 p-4">
        <Status tone="danger" className="text-sm">
          Backfill failed
        </Status>
        <p className="font-mono text-xs break-words text-muted-foreground">{b.error}</p>
      </div>
    );
  const total = b.total;
  return (
    <div className="flex flex-col gap-4 rounded-lg border bg-card p-5">
      <div className="flex items-baseline gap-2">
        <NumberTicker value={b.processed} animateOnMount={false} locale className="text-4xl font-semibold tracking-tight" />
        <span className="text-sm text-muted-foreground" aria-live="off">
          {b.status === "done" ? "items replayed" : total ? `of up to ${total.toLocaleString("en-US")} items` : "items replayed so far"}
        </span>
      </div>
      {total ? <Progress value={b.status === "done" ? 100 : (b.processed / total) * 100} label="Backfill progress" /> : null}
      <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-[13px] text-muted-foreground">
        {b.status === "done" ? (
          <Status tone="success">Done</Status>
        ) : (
          <Status tone={b.status === "queued" ? "waiting" : "progress"}>{b.status === "queued" ? "Queued, waiting for a worker" : "Replaying history"}</Status>
        )}
        <span className="tabular-nums">
          <NumberTicker value={b.with_truth} animateOnMount={false} locale /> with a maintainer label
        </span>
        {b.errors > 0 ? <span className="tabular-nums">{b.errors} skipped</span> : null}
      </div>
    </div>
  );
}
