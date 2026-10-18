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
import { answers, pct } from "@/lib/fmt";
import type { Backfill, Repo } from "@/lib/types";
import { questionLabel } from "@/lib/questions";
import { useAction } from "@/lib/use-api";
import { Continue, Primary, useFlow, useInterval } from "./flow";
import { SettleMeter } from "./parts";

const PREVIEW = ["issue.type", "priority", "route.area", "spam"]; // what the check on past issues can measure

/**
 * The onboarding signature. Check Jev on your past issues (the backfill), watch the count roll, and see each question's
 * accuracy settle in against how sure Jev must be. Always marked "probably a bit lower in real use", always with its answer count.
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
      if (now.status === "idle") toast.info("Check not started", { description: "Demo mode cannot run this. Open a repository with sample data to see results." });
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
                <Meter key={q.id} size="md" value={null} threshold={q.threshold} label={questionLabel(q.id)} />
              ))}
          </div>
          <p className="text-xs text-muted-foreground">Each fills in as items are compared, with its sample size.</p>
        </div>
      ) : (
        <section aria-labelledby="acc" className="flex flex-col gap-4">
          <div className="flex items-center justify-between gap-3">
            <h2 id="acc" className="inline-flex items-center gap-1.5 text-sm font-medium">
              Accuracy by question
              <InfoHint label="About these numbers">
                Probably a bit lower in real use. The model may have seen these public issues while it was trained, and closed issues are the easier ones.
                Your answer is the first label a maintainer applied. Learning mode measures new issues as they arrive.
              </InfoHint>
            </h2>
            <span className="text-xs text-muted-foreground">Probably a bit lower in real use</span>
          </div>
          {rows.length > 0 ? (
            <div className="grid gap-x-10 gap-y-6 sm:grid-cols-2">
              {rows.map((q, i) => (
                <SettleMeter key={q.id} i={i} value={q.accuracy} threshold={q.threshold} label={questionLabel(q.id)} valueText={`${pct(q.accuracy)} · ${answers(q.n)}${q.measured ? "" : " (not ready yet)"}`} />
              ))}
            </div>
          ) : b.status === "done" ? (
            <p className="text-sm text-muted-foreground">No past labels matched, so nothing is checked yet. Learning mode will check new items.</p>
          ) : (
            <div role="status" className="grid gap-x-10 gap-y-6 sm:grid-cols-2">
              <Skeleton className="h-9" />
              <Skeleton className="h-9" />
              <span className="sr-only">Accuracy appears as items are compared</span>
            </div>
          )}
          {rows.length > 0 ? <p className="text-xs text-muted-foreground">Real use will probably be a bit lower. Questions without past labels stay unchecked.</p> : null}
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
            Checking
          </Primary>
        </>
      ) : (
        <Primary loading={act.busy} onClick={start}>
          <Play />
          {b.status === "error" ? "Try again" : "Check Jev on your past issues"}
        </Primary>
      )}
    </div>
  );
}

function Reading({ b }: { b: Backfill }) {
  if (b.status === "idle")
    return (
      <p className="max-w-[60ch] text-sm text-muted-foreground">
        Jev looks again at your closed issues and merged PRs without acting. Then it compares its answers with the labels your maintainers applied.
        You can leave this page while it runs.
      </p>
    );
  if (b.status === "error")
    return (
      <div role="alert" className="flex flex-col gap-1 rounded-lg border border-destructive/40 bg-destructive/5 p-4">
        <Status tone="danger" className="text-sm">
          The check failed
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
          {b.status === "done" ? "items checked" : total ? `of up to ${total.toLocaleString("en-US")} items` : "items checked so far"}
        </span>
      </div>
      {total ? <Progress value={b.status === "done" ? 100 : (b.processed / total) * 100} label="Check progress" /> : null}
      <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-[13px] text-muted-foreground">
        {b.status === "done" ? (
          <Status tone="success">Done</Status>
        ) : (
          <Status tone={b.status === "queued" ? "waiting" : "progress"}>{b.status === "queued" ? "Waiting to start" : "Checking past issues"}</Status>
        )}
        <span className="tabular-nums">
          <NumberTicker value={b.with_truth} animateOnMount={false} locale /> with your answer
        </span>
        {b.errors > 0 ? <span className="tabular-nums">{b.errors} skipped</span> : null}
      </div>
    </div>
  );
}
