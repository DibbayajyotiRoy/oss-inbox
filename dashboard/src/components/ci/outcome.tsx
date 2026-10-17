import { Ban, Bug, Clock, FilePlus2, Gauge, GitMerge, ServerCrash, ShieldAlert, type LucideIcon } from "lucide-react";
import { Status, type StatusTone } from "@/components/ui/status";
import type { ChartRole } from "@/lib/chart-theme";
import type { CiOutcome } from "@/lib/types";

type Meta = { label: string; tone: StatusTone; icon: LucideIcon; role: ChartRole; help: string };

/** Outcome -> Status tone and chart colour. Graphite for routine outcomes, warning/destructive only where a human should look. */
export const OUTCOMES: Record<CiOutcome, Meta> = {
  filed: { label: "Filed", tone: "success", icon: FilePlus2, role: "acted", help: "A new issue was filed" },
  merged: { label: "Merged", tone: "success", icon: GitMerge, role: "series2", help: "Matched an existing issue and was merged into it" },
  flaky: { label: "Flaky", tone: "neutral", icon: Bug, role: "series3", help: "Known flaky test, no issue filed" },
  infra: { label: "Infra", tone: "neutral", icon: ServerCrash, role: "series4", help: "Looked like an infrastructure failure" },
  queued: { label: "Queued", tone: "waiting", icon: Clock, role: "series5", help: "Not sure, waiting for a maintainer in the queue" },
  rate_limited: { label: "Rate limited", tone: "warning", icon: Gauge, role: "threshold", help: "Hourly issue limit reached, not filed" },
  held: { label: "Held", tone: "danger", icon: ShieldAlert, role: "wrong", help: "Looked security-sensitive, held and never filed publicly" },
};

export const outcomeMeta = (o: string): Meta => OUTCOMES[o as CiOutcome] ?? { label: o, tone: "neutral", icon: Ban, role: "series3", help: o };

export function OutcomeStatus({ outcome, className }: { outcome: string; className?: string }) {
  const m = outcomeMeta(outcome);
  return (
    <Status tone={m.tone} icon={m.icon} className={className}>
      {m.label}
    </Status>
  );
}
