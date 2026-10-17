"use client";

import { useEffect, useState, type ReactNode } from "react";
import { Info, type LucideIcon } from "lucide-react";
import { Meter } from "@/components/ui/meter";
import { cn } from "@/lib/utils";

/** A quiet callout. `warning` for things that change what the numbers mean; `info` for everything else. */
export function Notice({
  tone = "info",
  icon: Icon = Info,
  title,
  children,
}: {
  tone?: "info" | "warning";
  icon?: LucideIcon;
  title: ReactNode;
  children?: ReactNode;
}) {
  const warn = tone === "warning";
  return (
    <div role="note" className={cn("flex gap-3 rounded-lg border p-4", warn ? "border-warning/40 bg-warning/5" : "bg-muted/30")}>
      <Icon aria-hidden className={cn("mt-0.5 size-4 shrink-0", warn ? "text-warning" : "text-muted-foreground")} />
      <div className="min-w-0 text-sm">
        <p className="font-medium">{title}</p>
        {children ? <div className="mt-0.5 text-muted-foreground">{children}</div> : null}
      </div>
    </div>
  );
}

/** A bordered, divided list: the one container for rows in the flows (no nested cards). */
export function Rows({ label, children, className }: { label?: string; children: ReactNode; className?: string }) {
  return (
    <ul aria-label={label} className={cn("divide-y overflow-hidden rounded-lg border bg-card", className)}>
      {children}
    </ul>
  );
}

export function GitHubMark({ className }: { className?: string }) {
  return (
    <svg aria-hidden viewBox="0 0 16 16" fill="currentColor" className={className}>
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
    </svg>
  );
}

/** A Meter that mounts empty and settles to its value like a needle; rows arrive staggered by `i`. */
export function SettleMeter({ value, threshold, label, i = 0 }: { value: number | null; threshold?: number; label: string; i?: number }) {
  const [v, setV] = useState<number | null>(null);
  useEffect(() => {
    const f = requestAnimationFrame(() => setV(value));
    return () => cancelAnimationFrame(f);
  }, [value]);
  return (
    <div
      className="motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-bottom-1 motion-safe:duration-250 motion-safe:ease-settle motion-safe:fill-mode-backwards"
      style={{ animationDelay: `${Math.min(i, 8) * 60}ms` }}
    >
      <Meter size="md" value={v} threshold={threshold} label={label} />
    </div>
  );
}
