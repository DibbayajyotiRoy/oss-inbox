import { InlineCode } from "@/components/ui/inline-code";
import { Skeleton } from "@/components/ui/skeleton";
import { age } from "@/lib/fmt";
import { featureName, type QueueEntry, type Suggestion } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Author } from "./author";
import { Verdict } from "./verdict";

/** Fixed row height: the list virtualizes without measuring and scroll-into-view is exact. */
export const ROW_H = 96;

/** "#123", or the kind for items without a GitHub number (CI reports). */
export const itemRef = (i: QueueEntry["item"]) => (i.number ? `#${i.number}` : i.kind.replace("_", " "));

const KIND: Record<QueueEntry["item"]["kind"], string> = { pr: "Pull request", issue: "Issue", ci_report: "CI failure", report: "Outside report" };
export const kindName = (k: QueueEntry["item"]["kind"]) => KIND[k];

/** The reading that explains why it is here: the first suggestion under its threshold, else the first. */
export const lead = (e: QueueEntry): Suggestion | undefined => e.suggestions.find((s) => s.confidence < s.threshold) ?? e.suggestions[0];

const lower = (s: string) => s.replace(/^[A-Z](?![A-Z])/, (c) => c.toLowerCase());
// The backend writes these reasons as short machine text (pipeline.py, inbound_gate.py, ci_gate.py); say them in plain words.
const REASONS: [RegExp, (m: RegExpExecArray, e: QueueEntry) => string][] = [
  [/^shadow:/, (_, e) => `Jev is still learning ${lower(featureName(e.feature))}`],
  [/\((\d+)%\), below threshold \((\d+)%\)/, (m) => `Jev wasn't sure enough (${m[1]}%, needs ${m[2]}%)`],
  [/\((\d+)%\), above threshold but accuracy not yet measured/, (m) => `Jev is sure (${m[1]}%) but hasn't been checked on this yet`],
  [/^not eligible:/, () => "Jev isn't allowed to act on this yet"],
  [/^possible duplicate of (#\d+)/, (m) => `Looks like a repeat of ${m[1]}`],
  [/^belongs in (.+)/, (m) => `Looks like it belongs in ${m[1]}`],
  [/^possible security report/, (_, e) => `Looks like a security report${/no supporting evidence/.test(e.reason) ? ", with no proof" : ""}`],
  [/^references files that don't exist/, (_, e) => `Mentions files that aren't in this repo${/no supporting evidence/.test(e.reason) ? ", with no proof" : ""}`],
  [/^describes documented or already rejected/, (_, e) => `Describes something already known or turned down${/no supporting evidence/.test(e.reason) ? ", with no proof" : ""}`],
];
/** Why the item is here, in plain words. Unknown reasons print as they are. */
export function reasonText(e: QueueEntry) {
  for (const [re, fn] of REASONS) {
    const m = re.exec(e.reason);
    if (m) return fn(m, e);
  }
  return e.reason;
}

/** One list row: title and wait, who and what, why in plain words, and the lead answer as a Meter with its threshold tick. */
export function Row({ e, start, focused, held, onSelect }: { e: QueueEntry; start: number; focused: boolean; held: boolean; onSelect: () => void }) {
  const s = lead(e);
  return (
    <div
      role="option"
      id={`row-${e.id}`}
      aria-selected={focused}
      onClick={onSelect}
      style={{ height: ROW_H, transform: `translateY(${start}px)` }}
      className={cn(
        "hover-pill absolute inset-x-0 top-0 flex cursor-default flex-col justify-center gap-1 border-b px-4 [--pill-from:1] motion-safe:transition-[background-color,box-shadow] motion-safe:duration-150 motion-safe:ease-settle",
        focused && "bg-accent ring-1 ring-ring ring-inset",
      )}
    >
      <div className="flex items-baseline gap-3">
        <span className="min-w-0 flex-1 truncate text-sm font-medium"><InlineCode text={e.item.title} /></span>
        <span className="shrink-0 text-xs text-muted-foreground tabular-nums">{age(e.age_hours)}</span>
      </div>
      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        {e.item.number && <span className="shrink-0 tabular-nums">#{e.item.number} ·</span>}
        <Author who={e.item} />
        <span className="shrink-0">· {kindName(e.item.kind)} · {held ? "held" : "not reviewed yet"}</span>
      </p>
      <p className="truncate text-xs">{reasonText(e)}</p>
      {s && <Verdict small id={s.question_id} answer={s.answer} confidence={s.confidence} threshold={s.threshold} />}
    </div>
  );
}

export const RowSkeleton = () => (
  <div style={{ height: ROW_H }} className="flex flex-col justify-center gap-2 border-b px-4">
    <Skeleton className="h-3.5 w-3/4" />
    <Skeleton className="h-3 w-1/2" />
    <Skeleton className="h-3 w-2/3" />
    <Skeleton className="h-1.5 w-full" />
  </div>
);
