"use client";
import { useEffect, useRef, useState } from "react";
import { CopyButton } from "@/components/ui/copy-button";
import { CardSection } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useReducedMotion } from "@/components/ui/presence";
import { useRepo } from "@/components/repo";
import { api } from "@/lib/api";
import type { Mode } from "@/lib/types";
import { CONFIG_PATH, NEED, featureModes, type FeatureChange } from "@/lib/types-settings";
import { GithubLink, useRun } from "./parts";
import { Segmented, type SegOption } from "./segmented";

const HELP: Record<string, string> = {
  inbound_gate: "Holds risky outside issues, suggests duplicates",
  issue_triage: "Issue type and missing details",
  pr_checks: "Breaking changes, rules, tests and docs",
  routing: "Which repo and area owns it",
  priority: "Priority from p0 to p3",
  spam: "Flags spam",
  ci_gate: "Files, merges or ignores CI failures",
};
const MODES: Mode[] = ["off", "shadow", "auto"];
type Pending = FeatureChange & { feature: string; mode: Mode; from: Mode };

export function Automation() {
  const { repo, canAct, reload } = useRepo();
  const [pending, setPending] = useState<Pending>();
  const [target, setTarget] = useState<string>();
  const { busy, run } = useRun();
  const panel = useRef<HTMLDivElement>(null);
  const still = useReducedMotion();

  // The commit landed (or the config changed under us): the rendered change no longer applies.
  if (pending && repo.features[pending.feature] !== pending.from) setPending(undefined);
  // Coming back from GitHub, re-read the repo so the change shows up without a manual refresh.
  useEffect(() => {
    if (!pending) return;
    window.addEventListener("focus", reload);
    return () => window.removeEventListener("focus", reload);
  }, [pending, reload]);

  // The panel renders below the list: bring it into view when a change is rendered.
  useEffect(() => {
    panel.current?.scrollIntoView({ block: "nearest", behavior: still ? "auto" : "smooth" });
  }, [pending, still]);

  async function pick(feature: string, mode: Mode) {
    if (mode === repo.features[feature]) return setPending(undefined);
    setTarget(feature);
    const r = await run(() => api<FeatureChange>(`/api/repos/${repo.id}/features`, { method: "POST", body: { feature, mode } }));
    if (r) setPending({ ...r, feature, mode, from: repo.features[feature] });
  }

  const questions = (f: string) => repo.questions.filter((q) => q.feature === f);
  return (
    <CardSection
      title="Automation"
      description="Choose what Jev may do, per feature."
      hint="Auto only acts on questions that are measured: enough labeled samples, with accuracy at or above the threshold. Shadow records and queues; off does nothing."
      footer={<p className="text-[13px] text-muted-foreground">Jev never writes to your repo. A change applies after you commit the file to {repo.default_branch}.</p>}
    >
      <ul className="divide-y divide-border">
        {featureModes(repo).map(([f, current]) => {
          const qs = questions(f);
          const measured = qs.filter((q) => q.measured).length;
          const value = pending?.feature === f ? pending.mode : current;
          const options: SegOption<Mode>[] = MODES.map((m) => ({
            id: m,
            label: m[0].toUpperCase() + m.slice(1),
            blocked: !canAct ? NEED.maintainer : m === "auto" && value !== "auto" && measured === 0 && "Not measured yet. Run a backfill in Evaluation to unlock auto.",
          }));
          return (
            <li key={f} className="flex flex-col gap-3 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <p className="font-mono text-[13px] font-medium">{f}</p>
                <p className="text-[13px] text-muted-foreground">
                  {HELP[f]}
                  {qs.length > 0 && <span className="tabular-nums"> · {measured} of {qs.length} measured</span>}
                </p>
              </div>
              <Segmented label={`${f} mode`} value={value} options={options} busy={busy && target === f} onChange={(m) => pick(f, m)} />
            </li>
          );
        })}
      </ul>
      {pending && (
        <div ref={panel} className="mt-5 flex flex-col gap-3 rounded-lg border border-dashed p-4">
          <p className="text-sm font-medium">
            Ready to commit <span className="ml-1 font-mono text-xs font-normal text-muted-foreground">{CONFIG_PATH}</span>
          </p>
          <pre className="overflow-x-auto rounded-md border bg-muted/30 py-2 font-mono text-[13px] leading-6" aria-label="YAML change">
            <Line>  features:</Line>
            <Line>    {pending.feature}:</Line>
            <Line sign="-">      mode: {pending.from === "off" ? '"off"' : pending.from}</Line>
            <Line sign="+">      mode: {pending.mode === "off" ? '"off"' : pending.mode}</Line>
          </pre>
          <div className="flex flex-wrap items-center gap-2">
            <GithubLink href={pending.edit_url} yaml={pending.yaml}>Commit in GitHub</GithubLink>
            <CopyButton value={pending.yaml} label="Copy YAML" variant="outline" />
            <Button variant="ghost" onClick={() => setPending(undefined)}>Discard</Button>
          </div>
        </div>
      )}
    </CardSection>
  );
}

/** One diff line: `+` green, `-` red, otherwise context. */
function Line({ sign, children }: { sign?: "+" | "-"; children: React.ReactNode }) {
  const tone = sign === "+" ? "bg-success/10 text-success" : sign === "-" ? "bg-destructive/10 text-destructive" : "text-muted-foreground";
  return (
    <span className={`block px-4 whitespace-pre ${tone}`}>
      {sign ?? " "}{children}
    </span>
  );
}
