import { Ban, Bug, Clock, FilePlus2, Gauge, GitMerge, ServerCrash, ShieldAlert, type LucideIcon } from "lucide-react";
import { Status, type StatusTone } from "@/components/ui/status";
import type { ChartRole } from "@/lib/chart-theme";
import type { CiOutcome } from "@/lib/types";

type Meta = { label: string; tone: StatusTone; icon: LucideIcon; role: ChartRole; help: string };

/** Outcome -> Status tone and chart colour. Green and teal for filed and merged, blue for queued, slate for infra, amber and red where a human should look. */
export const OUTCOMES: Record<CiOutcome, Meta> = {
  filed: { label: "New issue", tone: "success", icon: FilePlus2, role: "acted", help: "Jev opened a new issue" },
  merged: { label: "Added to issue", tone: "success", icon: GitMerge, role: "series2", help: "Matched an existing issue and joined it" },
  flaky: { label: "Random failure", tone: "neutral", icon: Bug, role: "series1", help: "A test that fails at random, so no issue was opened" },
  infra: { label: "Not a code bug", tone: "neutral", icon: ServerCrash, role: "unlabeled", help: "Looked like a problem outside your code, such as the CI machine or network" },
  queued: { label: "Needs review", tone: "waiting", icon: Clock, role: "queued", help: "Jev was not sure, so it waits for you under Needs review" },
  rate_limited: { label: "Over the limit", tone: "warning", icon: Gauge, role: "threshold", help: "The hourly limit for new issues was reached, so none was opened" },
  held: { label: "Held for a check", tone: "danger", icon: ShieldAlert, role: "wrong", help: "Looked security-sensitive, so it is held and never opened publicly" },
};

export const outcomeMeta = (o: string): Meta => OUTCOMES[o as CiOutcome] ?? { label: o, tone: "neutral", icon: Ban, role: "unlabeled", help: o };

export function OutcomeStatus({ outcome, className }: { outcome: string; className?: string }) {
  const m = outcomeMeta(outcome);
  return (
    <Status tone={m.tone} icon={m.icon} className={className}>
      {m.label}
    </Status>
  );
}
