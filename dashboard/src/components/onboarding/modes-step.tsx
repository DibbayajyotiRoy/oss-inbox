"use client";

import { ExternalLink } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CodeBlock } from "@/components/ui/code-block";
import { ModeControl } from "@/components/ui/mode-control";
import { Skeleton } from "@/components/ui/skeleton";
import { Status } from "@/components/ui/status";
import { pct } from "@/lib/fmt";
import { CONFIG_PATH, FEATURES, NEED, featureModes, type Repo } from "@/lib/types";
import { useModeEdits } from "@/lib/use-mode-edits";
import { Continue, useInterval } from "./flow";
import { Rows } from "./parts";

/**
 * Per-feature mode: off, shadow (suggest only) or auto. Auto is open only where a question of that feature is
 * measured. Changes are collected into one rendered file, because Jev never writes to the repo.
 */
export function ModesStep({ repo, reload }: { repo: Repo; reload: () => void }) {
  const { mode, pick, edits, out, busy } = useModeEdits(repo);
  // Once the commit lands, repo.features catches up and the edits empty themselves.
  useInterval(reload, edits.length ? 5000 : null);

  return (
    <div className="flex flex-col gap-8">
      <Rows label="Features">
        {featureModes(repo).map(([f]) => {
          const { name, about } = FEATURES[f] ?? { name: f, about: "" };
          const value = mode(f);
          const best = repo.questions.filter((q) => q.feature === f && q.measured).sort((a, b) => b.n - a.n)[0];
          return (
            <li key={f} className="flex flex-col gap-3 px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <div className="flex items-center gap-2 text-sm font-medium">
                  {name}
                  {value !== repo.features[f] ? <Badge variant="warning">Not committed</Badge> : null}
                </div>
                <p className="text-[13px] text-muted-foreground">{about}</p>
                <p className="mt-1 text-xs text-muted-foreground tabular-nums">
                  {best ? `Measured: ${best.id} ${pct(best.accuracy)}, n=${best.n.toLocaleString()}` : "Not measured yet"}
                  {best && (best.accuracy ?? 1) < best.threshold ? <span className="text-warning"> · below its {pct(best.threshold)} threshold</span> : null}
                </p>
              </div>
              <ModeControl label={`${name} mode`} value={value} busy={busy} onChange={(m) => pick(f, m)} disabled={{ auto: !best && NEED.measured }} />
            </li>
          );
        })}
      </Rows>

      {edits.length ? (
        <section aria-label="Commit your changes" className="flex flex-col gap-3 rounded-lg border p-4">
          <h2 className="text-sm font-medium">Commit this file to apply it</h2>
          <p className="text-[13px] text-muted-foreground">Nothing acts until it is committed on GitHub. Jev never writes to your repository.</p>
          {out ? (
            <>
              <CodeBlock filename={CONFIG_PATH} code={out.yaml} className="[&_pre]:max-h-64 [&_pre]:overflow-y-auto" />
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
