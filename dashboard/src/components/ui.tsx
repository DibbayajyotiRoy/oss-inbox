"use client";
import { useState, type ReactNode } from "react";
import { ApiError } from "@/lib/api";
import type { Res } from "@/lib/use-api";

type Tone = "neutral" | "ok" | "warn" | "bad" | "info";
const tones: Record<Tone, string> = {
  neutral: "bg-surface text-muted border-line",
  ok: "bg-ok-soft text-ok border-ok/40",
  warn: "bg-warn-soft text-warn border-warn/40",
  bad: "bg-bad-soft text-bad border-bad/40",
  info: "bg-info-soft text-accent border-accent/40",
};

export function Badge({ tone = "neutral", children, title }: { tone?: Tone; children: ReactNode; title?: string }) {
  return (
    <span title={title} className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2 text-xs font-medium leading-5 ${tones[tone]}`}>
      {children}
    </span>
  );
}

/** Horizontal probability bar; the % is always printed, so colour is never the only signal. */
export function Bar({ p, marker, tone = "info", label }: { p: number; marker?: number; tone?: Tone; label?: string }) {
  const fill = { neutral: "bg-muted", ok: "bg-ok", warn: "bg-warn", bad: "bg-bad", info: "bg-accent" }[tone];
  return (
    <div className="flex items-center gap-2">
      <div className="relative h-2 min-w-16 flex-1 rounded-full bg-line" aria-hidden>
        <div className={`h-2 rounded-full ${fill}`} style={{ width: `${Math.min(100, Math.max(0, p * 100))}%` }} />
        {marker !== undefined && <div className="absolute -top-1 h-4 w-0.5 bg-fg" style={{ left: `${marker * 100}%` }} title={`threshold ${marker}`} />}
      </div>
      <span className="w-12 text-right font-mono text-xs tabular-nums">{label ?? `${(p * 100).toFixed(p < 0.1 ? 1 : 0)}%`}</span>
    </div>
  );
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="rounded-lg border border-dashed border-line p-6 text-center">
      <p className="font-medium">{title}</p>
      {children && <p className="mx-auto mt-1 max-w-prose text-muted">{children}</p>}
    </div>
  );
}

export function ErrorBox({ error, retry }: { error: Error; retry?: () => void }) {
  const s = error instanceof ApiError ? error.status : 0;
  const hint = s === 401 ? "Redirecting to sign-in…" : s === 403 ? "You do not have access to this." : s === 404 ? "Not found." : "";
  return (
    <div role="alert" className="rounded-lg border border-bad/40 bg-bad-soft p-3 text-bad">
      <p className="font-medium">Something went wrong{s ? ` (${s})` : ""}</p>
      <p className="mt-0.5 break-words text-sm">{hint} {error.message}</p>
      {retry && <button className="btn mt-2" onClick={retry}>Retry</button>}
    </div>
  );
}

/** Loading / error / empty / data in one place. `empty` is shown when `isEmpty(data)`; it must say what will appear and why. */
export function Load<T>({ res, isEmpty, empty, children }: {
  res: Res<T>; isEmpty?: (d: T) => boolean; empty?: ReactNode; children: (d: T) => ReactNode;
}) {
  if (res.error) return <ErrorBox error={res.error} retry={res.reload} />;
  if (res.data === undefined) return <p className="py-8 text-center text-muted" role="status" aria-busy="true">Loading…</p>;
  if (isEmpty?.(res.data)) return <>{empty}</>;
  return <>{children(res.data)}</>;
}

export function Copy({ text, label = "Copy" }: { text: string; label?: string }) {
  const [state, setState] = useState<"idle" | "ok" | "fail">("idle");
  return (
    <button
      type="button"
      className="btn"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setState("ok");
        } catch {
          setState("fail");
        }
        setTimeout(() => setState("idle"), 2000);
      }}
    >
      {state === "ok" ? "Copied" : state === "fail" ? "Copy failed — select manually" : label}
    </button>
  );
}

export function Stat({ label, value, sub }: { label: string; value: ReactNode; sub?: ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="text-base font-semibold tabular-nums">{value}</dd>
      {sub && <dd className="text-xs text-muted">{sub}</dd>}
    </div>
  );
}

export function LoadMore({ p }: { p: { more: boolean; loadMore: () => void; loadingMore: boolean; moreError?: Error } }) {
  return (
    <div className="mt-3 text-center">
      {p.moreError && <p role="alert" className="mb-2 text-bad">{p.moreError.message}</p>}
      {p.more && <button className="btn" onClick={p.loadMore} disabled={p.loadingMore}>{p.loadingMore ? "Loading…" : "Load more"}</button>}
    </div>
  );
}
