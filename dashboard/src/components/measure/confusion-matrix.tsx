import Link from "next/link";
import { pct } from "@/lib/fmt";
import { cn } from "@/lib/utils";

/**
 * Confusion matrix as a CSS grid heat map. Rows are what maintainers decided, columns what Jev answered.
 * Intensity is the share of the row: graphite on the diagonal, destructive off it. The count is always printed,
 * and every cell that holds misses links to them via `href(truth, answer)`.
 */
export function ConfusionMatrix({
  labels,
  matrix,
  href,
  active,
}: {
  labels: string[];
  matrix: number[][];
  href: (truth: string, answer: string) => string;
  active?: { truth: string; answer: string };
}) {
  const head = "truncate px-2 text-xs text-muted-foreground";
  return (
    <div className="-mx-1 overflow-x-auto px-1 py-1">
      <div
        role="table"
        aria-label="Confusion matrix: rows are what maintainers decided, columns are what Jev answered"
        className="grid min-w-max gap-1"
        style={{ gridTemplateColumns: `minmax(6rem, max-content) repeat(${labels.length}, minmax(4.25rem, 1fr))` }}
      >
        <div role="row" className="contents">
          <div role="columnheader" className="flex items-end px-2 pb-1 text-[11px] leading-tight text-muted-foreground">Decided ↓<br />Jev said →</div>
          {labels.map((l) => (
            <div key={l} role="columnheader" title={l} className={cn(head, "flex items-end justify-center pb-1 text-center")}>
              <span className="truncate">{l}</span>
            </div>
          ))}
        </div>
        {matrix.map((row, i) => {
          const sum = row.reduce((a, b) => a + b, 0);
          return (
            <div key={labels[i]} role="row" className="contents">
              <div role="rowheader" title={labels[i]} className="flex flex-col justify-center px-2 text-sm">
                <span className="truncate font-medium">{labels[i]}</span>
                <span className="text-xs text-muted-foreground tabular-nums">n={sum.toLocaleString()}</span>
              </div>
              {row.map((c, j) => {
                const share = sum ? c / sum : 0;
                const right = i === j;
                const tint = c === 0 ? 0 : right ? Math.round(share * 32) : Math.round(14 + share * 46);
                const cell = (
                  <>
                    <span className={cn("text-base font-semibold tabular-nums", c === 0 && "font-normal text-muted-foreground/50")}>{c.toLocaleString()}</span>
                    {c > 0 && <span className="text-[11px] text-muted-foreground tabular-nums">{pct(share)}</span>}
                  </>
                );
                const cls = "flex min-h-14 flex-col items-center justify-center rounded-md border border-border/50";
                const style = { background: `color-mix(in oklab, var(${right ? "--foreground" : "--destructive"}) ${tint}%, transparent)` };
                const on = active?.truth === labels[i] && active?.answer === labels[j];
                return c > 0 && !right ? (
                  <Link
                    key={j}
                    role="cell"
                    href={href(labels[i], labels[j])}
                    scroll={false}
                    aria-current={on || undefined}
                    aria-label={`Decided ${labels[i]}, Jev said ${labels[j]}: ${c} items. See them.`}
                    style={style}
                    className={cn(cls, "outline-none hover:border-foreground/40 focus-visible:ring-2 focus-visible:ring-ring motion-safe:transition-[border-color,box-shadow] motion-safe:duration-150", on && "ring-2 ring-foreground")}
                  >
                    {cell}
                  </Link>
                ) : (
                  <div key={j} role="cell" style={style} className={cls}>{cell}</div>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}
