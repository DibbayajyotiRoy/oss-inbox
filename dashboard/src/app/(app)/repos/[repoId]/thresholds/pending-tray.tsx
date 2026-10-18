"use client";
import { ExternalLink, RotateCcw } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { CardSection } from "@/components/ui/card";
import { CopyButton } from "@/components/ui/copy-button";
import { ErrorState } from "@/components/ui/load";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/lib/api";
import { pct } from "@/lib/fmt";
import type { ConfigDoc, Rendered } from "@/lib/types";
import { questionLabel } from "@/lib/questions";
import { useApi } from "@/lib/use-api";
import { cn } from "@/lib/utils";

export type Change = { id: string; from: number; to: number; isDefault: boolean };
type Line = { t: " " | "+" | "-"; s: string };

/** Line diff by longest common subsequence, then everything further than 2 lines from a change collapses to "…". */
function diff(a: string[], b: string[]): Line[] {
  const L = Array.from({ length: a.length + 1 }, () => new Array<number>(b.length + 1).fill(0));
  for (let i = a.length - 1; i >= 0; i--) for (let j = b.length - 1; j >= 0; j--) L[i][j] = a[i] === b[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
  const out: Line[] = [];
  let i = 0, j = 0;
  while (i < a.length || j < b.length) {
    if (i < a.length && j < b.length && a[i] === b[j]) {
      out.push({ t: " ", s: a[i++] });
      j++;
    } else if (j >= b.length || (i < a.length && L[i + 1][j] >= L[i][j + 1])) out.push({ t: "-", s: a[i++] });
    else out.push({ t: "+", s: b[j++] });
  }
  const near = out.map((_, k) => out.slice(Math.max(0, k - 2), k + 3).some((l) => l.t !== " "));
  return out.flatMap((l, k) => (near[k] ? [l] : k === 0 || near[k - 1] ? [{ t: " " as const, s: "…" }] : []));
}

/**
 * Changed levels -> POST /config/render (debounced) -> a YAML diff to copy or commit on GitHub.
 * The dashboard only renders text; committing is always the user's own action.
 */
export function PendingTray({ repoId, changes, onUndo, onClear }: { repoId: number; changes: Change[]; onUndo: (id: string) => void; onClear: () => void }) {
  const cfg = useApi<ConfigDoc>(`/api/repos/${repoId}/config`);
  // Equal to the default: drop the key so the YAML stays minimal.
  const key = JSON.stringify(Object.fromEntries(changes.map((c) => [c.id, c.isDefault ? null : c.to])));
  const [settled, setSettled] = useState(key);
  const [attempt, setAttempt] = useState(0);
  const [out, setOut] = useState<{ key: string; r?: Rendered; error?: Error }>();
  useEffect(() => {
    const t = setTimeout(() => setSettled(key), 300);
    return () => clearTimeout(t);
  }, [key]);
  useEffect(() => {
    if (!cfg.data) return;
    let live = true;
    const thresholds: Record<string, number> = { ...(cfg.data.parsed.thresholds ?? {}) };
    for (const [id, v] of Object.entries(JSON.parse(settled) as Record<string, number | null>)) {
      if (v === null) delete thresholds[id];
      else thresholds[id] = v;
    }
    api<Rendered>(`/api/repos/${repoId}/config/render`, { method: "POST", body: { parsed: { ...cfg.data.parsed, thresholds } } }).then(
      (r) => live && setOut({ key: settled, r }),
      (error) => live && setOut({ key: settled, error }),
    );
    return () => {
      live = false;
    };
  }, [repoId, settled, attempt, cfg.data]);

  const r = out?.r;
  const busy = settled !== key || out?.key !== settled;
  const lines = useMemo(() => (r && cfg.data ? diff(cfg.data.yaml.split("\n"), r.yaml.split("\n")) : []), [r, cfg.data]);
  const error = cfg.error ?? out?.error;
  const ready = r && r.errors.length === 0 && !busy;

  return (
    <CardSection
      id="pending"
      title="Changes to save"
      description={`${changes.length} setting${changes.length > 1 ? "s" : ""} changed, nothing saved yet`}
      action={<Button variant="ghost" size="sm" onClick={onClear}>Discard all</Button>}
      footer={
        <div className="flex w-full flex-wrap items-center gap-2">
          {ready ? (
            <Button asChild>
              <a href={r.edit_url} target="_blank" rel="noreferrer">
                Save in GitHub <ExternalLink aria-hidden />
              </a>
            </Button>
          ) : (
            <Button disabled>Save in GitHub</Button>
          )}
          <CopyButton value={r?.yaml ?? ""} label="Copy file text" variant="outline" size="md" />
          <p className="text-xs text-muted-foreground sm:ml-auto">This page never changes your repo itself.</p>
        </div>
      }
    >
      <ul className="mb-4 divide-y divide-border">
        {changes.map((c) => (
          <li key={c.id} className="flex items-center gap-3 py-1.5 text-sm">
            <span className="min-w-0 flex-1 truncate text-[13px]">{questionLabel(c.id)}</span>
            <span className="tabular-nums text-muted-foreground">{pct(c.from)}</span>
            <span aria-hidden className="text-muted-foreground">→</span>
            <span className="font-medium tabular-nums">{pct(c.to)}</span>
            <Button variant="ghost" size="icon-sm" aria-label={`Undo ${questionLabel(c.id)}`} onClick={() => onUndo(c.id)}>
              <RotateCcw />
            </Button>
          </li>
        ))}
      </ul>
      {error ? (
        <ErrorState error={error} retry={cfg.error ? cfg.reload : () => setAttempt((a) => a + 1)} />
      ) : !r ? (
        <Skeleton className="h-28 w-full" />
      ) : (
        <>
          {r.errors.length > 0 && (
            <ul role="alert" className="mb-3 rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
              {r.errors.map((e) => <li key={e}>{e}</li>)}
            </ul>
          )}
          <div aria-busy={busy} className={cn("overflow-hidden rounded-lg border border-border bg-muted/30 motion-safe:transition-opacity motion-safe:duration-150", busy && "opacity-60")}>
            <div className="flex h-9 items-center border-b border-border bg-muted/40 px-3 font-mono text-xs">.github/jev-triage.yml</div>
            <pre tabIndex={0} aria-label="Changes to the file" className="max-h-80 overflow-auto py-2 font-mono text-[13px] leading-6 outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset">
              <code className="grid min-w-max">
                {lines.map((l, k) => (
                  <span key={k} className={cn("flex px-3", l.t === "+" && "bg-success/10 text-success", l.t === "-" && "bg-destructive/10 text-destructive", l.t === " " && "text-muted-foreground")}>
                    <span aria-hidden className="w-4 shrink-0 select-none">{l.t === " " ? "" : l.t}</span>
                    <span className="whitespace-pre">{l.s || " "}</span>
                  </span>
                ))}
              </code>
            </pre>
          </div>
        </>
      )}
    </CardSection>
  );
}
