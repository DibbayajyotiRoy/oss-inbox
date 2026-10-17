"use client";
import { useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { CardSection } from "@/components/ui/card";
import { CopyButton } from "@/components/ui/copy-button";
import { ModeControl } from "@/components/ui/mode-control";
import { useReducedMotion } from "@/components/ui/presence";
import { useRepo } from "@/components/repo";
import { CONFIG_PATH, FEATURES, NEED, featureModes } from "@/lib/types";
import { useModeEdits } from "@/lib/use-mode-edits";
import { GithubLink } from "./parts";

const quote = (m: string) => (m === "off" ? '"off"' : m);

export function Automation() {
  const { repo, canAct, reload } = useRepo();
  const { mode, pick, edits, out, busy, discard } = useModeEdits(repo);
  const panel = useRef<HTMLDivElement>(null);
  const still = useReducedMotion();

  // Coming back from GitHub, re-read the repo so a landed commit shows up without a manual refresh.
  useEffect(() => {
    if (!edits.length) return;
    window.addEventListener("focus", reload);
    return () => window.removeEventListener("focus", reload);
  }, [edits.length, reload]);

  // The panel renders below the list: bring it into view when a change is rendered.
  useEffect(() => {
    if (out) panel.current?.scrollIntoView({ block: "nearest", behavior: still ? "auto" : "smooth" });
  }, [out, still]);

  return (
    <CardSection
      title="Automation"
      description="Choose what Jev may do, per feature."
      hint="Auto only acts on questions that are measured: enough labeled samples, with accuracy at or above the threshold. Shadow records and queues; off does nothing."
      footer={<p className="text-[13px] text-muted-foreground">Jev never writes to your repo. A change applies after you commit the file to {repo.default_branch}.</p>}
    >
      <ul className="divide-y divide-border">
        {featureModes(repo).map(([f]) => {
          const qs = repo.questions.filter((q) => q.feature === f);
          const measured = qs.filter((q) => q.measured).length;
          const value = mode(f);
          const no = !canAct && NEED.maintainer;
          return (
            <li key={f} className="flex flex-col gap-3 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <p className="font-mono text-[13px] font-medium">{f}</p>
                <p className="text-[13px] text-muted-foreground">
                  {FEATURES[f]?.about}
                  {qs.length > 0 && <span className="tabular-nums"> · {measured} of {qs.length} measured</span>}
                </p>
              </div>
              <ModeControl
                label={`${f} mode`}
                value={value}
                busy={busy}
                onChange={(m) => pick(f, m)}
                disabled={{ off: no, shadow: no, auto: no || (value !== "auto" && measured === 0 && NEED.measured) }}
              />
            </li>
          );
        })}
      </ul>
      {out && (
        <div ref={panel} className="mt-5 flex flex-col gap-3 rounded-lg border border-dashed p-4">
          <p className="text-sm font-medium">
            Ready to commit <span className="ml-1 font-mono text-xs font-normal text-muted-foreground">{CONFIG_PATH}</span>
          </p>
          <pre className="overflow-x-auto rounded-md border bg-muted/30 py-2 font-mono text-[13px] leading-6" aria-label="YAML change">
            <Line>  features:</Line>
            {edits.flatMap((e) => [
              <Line key={e.feature}>    {e.feature}:</Line>,
              <Line key={`${e.feature}-`} sign="-">      mode: {quote(e.from)}</Line>,
              <Line key={`${e.feature}+`} sign="+">      mode: {quote(e.to)}</Line>,
            ])}
          </pre>
          {out.errors.length > 0 && <p role="alert" className="text-sm text-destructive">{out.errors.join("; ")}</p>}
          <div className="flex flex-wrap items-center gap-2">
            <GithubLink href={out.edit_url} yaml={out.yaml}>Commit in GitHub</GithubLink>
            <CopyButton value={out.yaml} label="Copy YAML" variant="outline" />
            <Button variant="ghost" onClick={discard}>Discard</Button>
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
