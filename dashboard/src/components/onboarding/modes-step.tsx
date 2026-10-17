"use client";

import { useRef, useState } from "react";
import { ExternalLink } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CodeBlock } from "@/components/ui/code-block";
import { ErrorState } from "@/components/ui/load";
import { Skeleton } from "@/components/ui/skeleton";
import { Status } from "@/components/ui/status";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { api, errText } from "@/lib/api";
import { pct } from "@/lib/fmt";
import { toast } from "@/components/ui/toaster";
import type { ConfigDoc, Mode } from "@/lib/types";
import type { RenderedConfig, RepoDetail } from "@/lib/types-onboarding";
import { useApi } from "@/lib/use-api";
import { cn } from "@/lib/utils";
import { Continue, useInterval } from "./flow";
import { Rows } from "./parts";

const MODES: Mode[] = ["off", "shadow", "auto"];
const rank = (f: string) => (Object.keys(FEATURES).indexOf(f) + 1 || 99);
const FEATURES: Record<string, [string, string]> = {
  inbound_gate: ["Inbound gate", "Checks reports are reproducible and grounded"],
  issue_triage: ["Issue triage", "Labels the type and what is missing"],
  pr_checks: ["PR checks", "Flags breaking changes and rule gaps"],
  routing: ["Routing", "Suggests the area or repository"],
  priority: ["Priority", "Suggests p0 to p3"],
  spam: ["Spam", "Flags empty and promotional items"],
  ci_gate: ["CI gate", "Files and merges CI failure reports"],
};

/**
 * Per-feature mode: off, shadow (suggest only) or auto. Auto is open only where a question of that feature is
 * measured. Changes are collected into one rendered file, because Jev never writes to the repo.
 */
export function ModesStep({ repo, reload }: { repo: RepoDetail; reload: () => void }) {
  const cfg = useApi<ConfigDoc>(`/api/repos/${repo.id}/config`);
  const [draft, setDraft] = useState<Record<string, Mode>>({});
  const [out, setOut] = useState<RenderedConfig>();
  const seq = useRef(0);
  const changed = Object.entries(draft).filter(([f, m]) => m !== repo.features[f]);
  // Once the commit lands, repo.features catches up and the draft empties itself.
  useInterval(reload, changed.length ? 5000 : null);

  async function pick(feature: string, mode: Mode) {
    const next = { ...draft, [feature]: mode };
    setDraft(next);
    const n = ++seq.current;
    const diff = Object.entries(next).filter(([f, m]) => m !== repo.features[f]);
    if (!diff.length || !cfg.data) return setOut(undefined);
    setOut(undefined);
    try {
      const parsed = { ...cfg.data.parsed, features: { ...(cfg.data.parsed.features as object), ...Object.fromEntries(diff.map(([f, m]) => [f, { mode: m }])) } };
      const r = await api<RenderedConfig>(`/api/repos/${repo.id}/config/render`, { method: "POST", body: { parsed } });
      if (n === seq.current) setOut(r);
    } catch (e) {
      if (n === seq.current) toast.error("Couldn't render the change", { description: errText(e) });
    }
  }

  if (cfg.error && !cfg.data) return <ErrorState error={cfg.error} retry={cfg.reload} />;
  return (
    <div className="flex flex-col gap-8">
      <Rows label="Features">
        {Object.keys(repo.features)
          .sort((a, b) => rank(a) - rank(b))
          .map((f) => {
          const [name, about] = FEATURES[f] ?? [f, ""];
          const mode = draft[f] ?? repo.features[f];
          const measured = repo.questions.filter((q) => q.feature === f && q.measured).sort((a, b) => b.n - a.n);
          const best = measured[0];
          return (
            <li key={f} className="flex flex-col gap-3 px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <div className="flex items-center gap-2 text-sm font-medium">
                  {name}
                  {mode !== repo.features[f] ? <Badge variant="warning">Not committed</Badge> : null}
                </div>
                <p className="text-[13px] text-muted-foreground">{about}</p>
                <p className="mt-1 text-xs text-muted-foreground tabular-nums">
                  {best ? `Measured: ${best.id} ${pct(best.accuracy)}, n = ${best.n}` : "Not measured yet"}
                  {best && (best.accuracy ?? 1) < best.threshold ? <span className="text-warning"> · below its {pct(best.threshold)} threshold</span> : null}
                </p>
              </div>
              <ModeSwitch feature={name} value={mode} autoBlocked={!best} onChange={(m) => pick(f, m)} />
            </li>
          );
        })}
      </Rows>

      {changed.length ? (
        <section aria-label="Commit your changes" className="flex flex-col gap-3 rounded-lg border p-4">
          <h2 className="text-sm font-medium">Commit this file to apply it</h2>
          <p className="text-[13px] text-muted-foreground">Nothing acts until it is committed on GitHub. Jev never writes to your repository.</p>
          {out ? (
            <>
              <CodeBlock filename=".github/jev-triage.yml" code={out.yaml} className="[&_pre]:max-h-64 [&_pre]:overflow-y-auto" />
              {out.errors.length ? (
                <p role="alert" className="text-sm text-destructive">
                  {out.errors.join("; ")}
                </p>
              ) : null}
              <div className="flex flex-wrap items-center justify-between gap-3">
                <Status tone="progress">Waiting for your commit</Status>
                <Button asChild variant="outline" size="sm">
                  <a href={out.edit_url} target="_blank" rel="noreferrer">
                    Open in GitHub
                    <ExternalLink />
                  </a>
                </Button>
              </div>
            </>
          ) : (
            <Skeleton className="h-32" />
          )}
        </section>
      ) : (
        <p className="text-[13px] text-muted-foreground">Shadow is the default: Jev suggests, and nothing on GitHub changes.</p>
      )}
      <Continue />
    </div>
  );
}

function ModeSwitch({ feature, value, autoBlocked, onChange }: { feature: string; value: Mode; autoBlocked: boolean; onChange: (m: Mode) => void }) {
  return (
    <div role="radiogroup" aria-label={`${feature} mode`} className="inline-flex w-fit shrink-0 items-center gap-0.5 rounded-lg border bg-card p-0.5">
      {MODES.map((m) => {
        const blocked = m === "auto" && autoBlocked;
        const option = (
          <label
            className={cn(
              "cursor-pointer rounded-md px-3 py-1 text-[13px] font-medium text-muted-foreground motion-safe:transition-[background-color,color] motion-safe:duration-150 hover:text-foreground",
              "has-checked:bg-accent has-checked:text-foreground has-focus-visible:ring-2 has-focus-visible:ring-ring",
              blocked && "cursor-not-allowed opacity-50 hover:text-muted-foreground",
            )}
          >
            <input type="radio" className="sr-only" name={feature} value={m} checked={value === m} disabled={blocked} onChange={() => onChange(m)} />
            {m}
            {blocked ? <span className="sr-only"> (needs a measured question)</span> : null}
          </label>
        );
        return blocked ? (
          <Tooltip key={m}>
            <TooltipTrigger asChild>
              <span tabIndex={0} className="rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring">
                {option}
              </span>
            </TooltipTrigger>
            <TooltipContent>Measure one of its questions first</TooltipContent>
          </Tooltip>
        ) : (
          <span key={m}>{option}</span>
        );
      })}
    </div>
  );
}
