"use client";
import { useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { CardSection } from "@/components/ui/card";
import { CopyButton } from "@/components/ui/copy-button";
import { ModeControl, autoReason } from "@/components/ui/mode-control";
import { useReducedMotion } from "@/components/ui/presence";
import { useRepo } from "@/components/repo";
import { CONFIG_PATH, NEED, featureModes, featureName, FEATURES } from "@/lib/types";
import { cn } from "@/lib/utils";
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
      hint="On: Jev acts by itself, but only after it has been checked on enough of your past answers. Learning: Jev suggests and never acts. Off: Jev does nothing."
      footer={<p className="text-[13px] text-muted-foreground">OSS Inbox never changes your repo itself. A change applies once you save the file to {repo.default_branch}.</p>}
    >
      <ul className="divide-y divide-border">
        {featureModes(repo).map(([f]) => {
          const block = autoReason(repo.questions.filter((q) => q.feature === f));
          const value = mode(f);
          const no = !canAct && NEED.maintainer;
          return (
            <li key={f} className="flex flex-col gap-3 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <p className="text-[13px] font-medium">{featureName(f)}</p>
                <p className="text-[13px] text-muted-foreground">{FEATURES[f]?.about}</p>
                {block && <p className={cn("text-xs tabular-nums", value === "auto" ? "text-warning" : "text-muted-foreground")}>{block}</p>}
              </div>
              <ModeControl
                label={`${featureName(f)} setting`}
                value={value}
                busy={busy}
                onChange={(m) => pick(f, m)}
                autoReason={block}
                disabled={{ off: no, shadow: no, auto: no }}
              />
            </li>
          );
        })}
      </ul>
      {out && (
        <div ref={panel} className="mt-5 flex flex-col gap-3 rounded-lg border border-dashed p-4">
          <p className="text-sm font-medium">
            Ready to save <span className="ml-1 font-mono text-xs font-normal text-muted-foreground">{CONFIG_PATH}</span>
          </p>
          <pre className="overflow-x-auto rounded-md border bg-muted/30 py-2 font-mono text-[13px] leading-6" aria-label="Change to the file">
            <Line>  features:</Line>
            {edits.flatMap((e) => [
              <Line key={e.feature}>    {e.feature}:</Line>,
              <Line key={`${e.feature}-`} sign="-">      mode: {quote(e.from)}</Line>,
              <Line key={`${e.feature}+`} sign="+">      mode: {quote(e.to)}</Line>,
            ])}
          </pre>
          {out.errors.length > 0 && <p role="alert" className="text-sm text-destructive">{out.errors.join("; ")}</p>}
          <div className="flex flex-wrap items-center gap-2">
            <GithubLink href={out.edit_url} yaml={out.yaml}>Save in GitHub</GithubLink>
            <CopyButton value={out.yaml} label="Copy file text" variant="outline" />
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
