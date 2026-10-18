"use client";

import { ExternalLink } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CodeBlock } from "@/components/ui/code-block";
import { ModeControl, autoReason } from "@/components/ui/mode-control";
import { Skeleton } from "@/components/ui/skeleton";
import { Status } from "@/components/ui/status";
import { rightOf } from "@/lib/fmt";
import { CONFIG_PATH, FEATURES, featureModes, type Repo } from "@/lib/types";
import { questionLabel } from "@/lib/questions";
import { cn } from "@/lib/utils";
import { useModeEdits } from "@/lib/use-mode-edits";
import { Continue, useInterval } from "./flow";
import { Rows } from "./parts";

/**
 * Per-feature setting: Off, Learning (suggest only) or On. On is open only where every question of that feature is
 * checked. Changes are collected into one rendered file, because Jev never writes to the repo.
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
          const qs = repo.questions.filter((q) => q.feature === f);
          const best = qs.filter((q) => q.measured).sort((a, b) => b.n - a.n)[0];
          const block = autoReason(qs);
          return (
            <li key={f} className="flex flex-col gap-3 px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <div className="flex items-center gap-2 text-sm font-medium">
                  {name}
                  {value !== repo.features[f] ? <Badge variant="warning">Not saved yet</Badge> : null}
                </div>
                <p className="text-[13px] text-muted-foreground">{about}</p>
                {best && (
                  <p className="mt-1 text-xs text-muted-foreground tabular-nums">Checked on &ldquo;{questionLabel(best.id)}&rdquo;: {rightOf(best.accuracy, best.n)}</p>
                )}
                {block && <p className={cn("text-xs", !best && "mt-1", value === "auto" ? "text-warning" : "text-muted-foreground")}>{block}</p>}
              </div>
              <ModeControl label={`${name} setting`} value={value} busy={busy} onChange={(m) => pick(f, m)} autoReason={block} />
            </li>
          );
        })}
      </Rows>

      {edits.length ? (
        <section aria-label="Save your changes" className="flex flex-col gap-3 rounded-lg border p-4">
          <h2 className="text-sm font-medium">Save this file to apply it</h2>
          <p className="text-[13px] text-muted-foreground">Nothing changes until you save it on GitHub. Jev never edits your repository itself.</p>
          {out ? (
            <>
              <CodeBlock filename={CONFIG_PATH} code={out.yaml} className="[&_pre]:max-h-64 [&_pre]:overflow-y-auto" />
              {out.errors.length ? (
                <p role="alert" className="text-sm text-destructive">
                  {out.errors.join("; ")}
                </p>
              ) : null}
              <div className="flex flex-wrap items-center justify-between gap-3">
                <Status tone="progress">Waiting for you to save it</Status>
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
        <p className="text-[13px] text-muted-foreground">Learning is the default: Jev suggests, and nothing on GitHub changes.</p>
      )}
      <Continue />
    </div>
  );
}
