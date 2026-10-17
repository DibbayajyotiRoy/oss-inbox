"use client";

import { Play } from "lucide-react";
import { useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { CardSection } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Status, type StatusTone } from "@/components/ui/status";
import { toast } from "@/components/ui/toaster";
import { api, errText } from "@/lib/api";
import { when } from "@/lib/fmt";
import { useAction, useApi } from "@/lib/use-api";

export type Backfill = {
  status: "idle" | "queued" | "running" | "done" | "error";
  processed: number; total: number | null; with_truth: number; errors: number;
  error: string | null; started_at: string | null; finished_at: string | null;
};

// GET /backfill is the live source; the repo's `backfill_status` string ("error: ...") covers a backend without it.
const norm = (s?: string | null): Backfill["status"] => (!s ? "idle" : s.startsWith("error") ? "error" : s === "queued" || s === "running" || s === "done" ? s : "idle");

/**
 * Backfill state, polled every 2.5s while queued or running. `onProgress` fires on each poll and once more
 * when the run ends, so a table beside it can settle in as results arrive.
 */
export function useBackfill(repoId: number, fallback?: string | null, onProgress?: () => void) {
  const res = useApi<Backfill>(`/api/repos/${repoId}/backfill`);
  const act = useAction();
  const data = res.error ? undefined : res.data;
  const status = data?.status ?? norm(fallback);
  const active = status === "queued" || status === "running";
  const latest = useRef({ reload: res.reload, onProgress });
  const was = useRef(active);
  useEffect(() => {
    latest.current = { reload: res.reload, onProgress };
    if (was.current && !active) onProgress?.();
    was.current = active;
  });
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => {
      latest.current.reload();
      latest.current.onProgress?.();
    }, 2500);
    return () => clearInterval(t);
  }, [active]);

  const run = () =>
    act.run(async () => {
      try {
        await api(`/api/repos/${repoId}/backfill`, { method: "POST" });
      } catch (e) {
        toast.error("Couldn't start the backfill", { description: errText(e) });
        throw e;
      }
      toast.success("Backfill queued");
      res.reload();
    });
  return { status, data, active, busy: act.busy, run };
}

const TONE: Record<Backfill["status"], [StatusTone, string]> = {
  idle: ["waiting", "Not run yet"],
  queued: ["waiting", "Queued"],
  running: ["progress", "Running"],
  done: ["success", "Done"],
  error: ["danger", "Failed"],
};

/** Backfill status, live progress and the Run button. The upper-bound note lives with the numbers it qualifies. */
export function BackfillCard({ bf, canAct }: { bf: ReturnType<typeof useBackfill>; canAct: boolean }) {
  const { status, data: d, active, busy } = bf;
  const [tone, text] = TONE[status];
  return (
    <CardSection
      title="Backfill"
      description="Replays closed issues and merged PRs."
      hint="Re-asks Jev about past items whose outcome is known, then scores the answers. Accuracy appears here as it completes."
      action={
        <Button size="sm" variant="outline" loading={busy} disabled={!canAct || active} onClick={bf.run}>
          <Play aria-hidden /> {status === "done" ? "Run again" : status === "error" ? "Retry" : "Run backfill"}
        </Button>
      }
    >
      <div className="flex flex-col gap-3" aria-live="polite">
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <Status tone={tone}>{text}</Status>
          {status === "done" && d?.finished_at && <span className="text-xs text-muted-foreground">{when(d.finished_at)}</span>}
          {!canAct && <span className="text-xs text-muted-foreground">Maintainer access required to run it.</span>}
        </p>
        {status === "error" && d?.error && <p className="text-sm break-words text-destructive">{d.error}</p>}
        {d && d.total != null && active && <Progress value={d.total ? (d.processed / d.total) * 100 : 0} label="Backfill progress" />}
        {d && (active || d.processed > 0) && (
          <p className="text-xs text-muted-foreground tabular-nums">
            {d.processed.toLocaleString()}
            {d.total != null && ` of ${d.total.toLocaleString()}`} processed · {d.with_truth.toLocaleString()} with a known answer · {d.errors.toLocaleString()} errors
          </p>
        )}
      </div>
    </CardSection>
  );
}
