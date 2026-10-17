import { Meter } from "@/components/ui/meter";
import { Skeleton } from "@/components/ui/skeleton";
import { age } from "@/lib/fmt";
import type { QueueEntry, Suggestion } from "@/lib/types";
import { cn } from "@/lib/utils";

/** Fixed row height: the list virtualizes without measuring and scroll-into-view is exact. */
export const ROW_H = 76;

/** `inbound_gate` -> "Inbound gate", `ci_gate` -> "CI gate". */
export const featureName = (f: string) => {
  const t = f.replaceAll("_", " ").replace(/\b(ci|pr)\b/g, (m) => m.toUpperCase());
  return t.charAt(0).toUpperCase() + t.slice(1);
};

/** "#123", or the kind for items without a GitHub number (CI reports). */
export const itemRef = (i: QueueEntry["item"]) => (i.number ? `#${i.number}` : i.kind.replace("_", " "));

/** The reading that explains why it is here: the first suggestion under its threshold, else the first. */
export const lead = (e: QueueEntry): Suggestion | undefined => e.suggestions.find((s) => s.confidence < s.threshold) ?? e.suggestions[0];

/** One queue row: title, age, #number, author, reason, and the lead suggestion as a Meter with its threshold tick. */
export function Row({ e, start, focused, onSelect }: { e: QueueEntry; start: number; focused: boolean; onSelect: () => void }) {
  const s = lead(e);
  return (
    <div
      role="option"
      id={`row-${e.id}`}
      aria-selected={focused}
      onClick={onSelect}
      style={{ height: ROW_H, transform: `translateY(${start}px)` }}
      className={cn(
        "absolute inset-x-0 top-0 flex cursor-default flex-col justify-center gap-1 border-b px-4 motion-safe:transition-[background-color,box-shadow] motion-safe:duration-150 motion-safe:ease-settle",
        focused ? "bg-accent ring-1 ring-ring ring-inset" : "hover:bg-muted/50",
      )}
    >
      <div className="flex items-baseline gap-3">
        <span className="min-w-0 flex-1 truncate text-sm font-medium">{e.item.title}</span>
        <span className="shrink-0 text-xs text-muted-foreground tabular-nums">{age(e.age_hours)}</span>
      </div>
      <p className="truncate text-xs text-muted-foreground">
        <span className="tabular-nums">{itemRef(e.item)}</span> · {e.item.author ?? "unknown"} · {e.reason}
      </p>
      {s ? (
        <div className="flex items-center gap-2">
          <span className="w-16 shrink-0 truncate text-xs text-muted-foreground">{s.answer}</span>
          <Meter value={s.confidence} threshold={s.threshold} className="min-w-0 flex-1" />
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">No suggestion</p>
      )}
    </div>
  );
}

export const RowSkeleton = () => (
  <div style={{ height: ROW_H }} className="flex flex-col justify-center gap-2 border-b px-4">
    <Skeleton className="h-3.5 w-3/4" />
    <Skeleton className="h-3 w-1/2" />
    <Skeleton className="h-1.5 w-full" />
  </div>
);
