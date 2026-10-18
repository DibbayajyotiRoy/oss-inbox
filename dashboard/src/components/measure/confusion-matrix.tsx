"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { answers, pct } from "@/lib/fmt";
import { useScrollable } from "@/lib/use-scrollable";
import { cn } from "@/lib/utils";

/**
 * Your answers against Jev's as a heat table. Rows are what you said, columns what Jev said.
 * Intensity is the share of the row: green on the diagonal, red off it. The count is always printed,
 * and every cell that holds misses links to them via `href(truth, answer)`.
 * Wide matrices scroll sideways: the row labels stay put, a fade marks the edge that hides columns,
 * and the scroller is a focusable region while it overflows.
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
  const { ref: scrollRef, ...scroll } = useScrollable<HTMLDivElement>("Right and wrong answers");
  const [el, setEl] = useState<HTMLDivElement | null>(null);
  const [more, setMore] = useState(false); // columns hide beyond the right edge
  const ref = useCallback((n: HTMLDivElement | null) => { scrollRef(n); setEl(n); }, [scrollRef]);
  useEffect(() => {
    if (!el) return;
    const read = () => setMore(el.scrollLeft + el.clientWidth < el.scrollWidth - 1);
    read();
    el.addEventListener("scroll", read, { passive: true });
    const ro = new ResizeObserver(read);
    ro.observe(el);
    if (el.firstElementChild) ro.observe(el.firstElementChild);
    return () => {
      el.removeEventListener("scroll", read);
      ro.disconnect();
    };
  }, [el]);

  return (
    <div className="relative">
      <div ref={ref} {...scroll} className="-mx-1 overflow-x-auto px-1 py-1">
        <table aria-label="Your answers against Jev's answers: rows are what you said, columns are what Jev said" className="w-full border-separate border-spacing-1">
          <thead>
            <tr>
              <th scope="col" className="sticky left-0 z-10 min-w-24 bg-card px-2 pb-1 text-left align-bottom text-[11px] leading-tight font-normal text-muted-foreground shadow-[4px_0_0_0_var(--card)]">
                You said ↓<br />Jev said →
              </th>
              {labels.map((l) => (
                <th key={l} scope="col" title={l} className="min-w-[4.25rem] px-2 pb-1 text-center align-bottom text-xs font-normal text-muted-foreground">
                  <span className="block max-w-28 truncate">{l}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {matrix.map((row, i) => {
              const sum = row.reduce((a, b) => a + b, 0);
              return (
                <tr key={labels[i]}>
                  <th scope="row" title={labels[i]} className="sticky left-0 z-10 bg-card px-2 text-left text-sm font-normal shadow-[4px_0_0_0_var(--card)]">
                    <span className="block max-w-32 truncate font-medium">{labels[i]}</span>
                    <span className="text-xs text-muted-foreground tabular-nums">{answers(sum)}</span>
                  </th>
                  {row.map((c, j) => {
                    const share = sum ? c / sum : 0;
                    const right = i === j;
                    const tint = c === 0 ? 0 : right ? Math.round(share * 32) : Math.round(14 + share * 46);
                    const cell = (
                      <>
                        <span className={cn("text-base font-semibold tabular-nums", c === 0 && "font-normal text-muted-foreground")}>{c.toLocaleString()}</span>
                        {c > 0 && <span className="text-[11px] text-foreground tabular-nums">{pct(share)}</span>}
                      </>
                    );
                    const cls = "flex min-h-14 flex-col items-center justify-center rounded-md border border-border/50";
                    const style = { background: `color-mix(in oklab, var(${right ? "--chart-acted" : "--chart-wrong"}) ${tint}%, transparent)` };
                    const on = active?.truth === labels[i] && active?.answer === labels[j];
                    return (
                      <td key={j} className="p-0">
                        {c > 0 && !right ? (
                          <Link
                            href={href(labels[i], labels[j])}
                            scroll={false}
                            aria-current={on || undefined}
                            aria-label={`You said ${labels[i]}, Jev said ${labels[j]}: ${c} items. See them.`}
                            style={style}
                            className={cn(cls, "outline-none hover:border-foreground/40 focus-visible:ring-2 focus-visible:ring-ring motion-safe:transition-[border-color,box-shadow] motion-safe:duration-150", on && "ring-2 ring-foreground")}
                          >
                            {cell}
                          </Link>
                        ) : (
                          <div style={style} className={cls}>{cell}</div>
                        )}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div aria-hidden className={cn("pointer-events-none absolute inset-y-0 right-0 w-10 bg-linear-to-l from-card to-transparent motion-safe:transition-opacity motion-safe:duration-150", !more && "opacity-0")} />
    </div>
  );
}
