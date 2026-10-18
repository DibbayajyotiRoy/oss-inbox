"use client";

import Link from "next/link";
import { EvilComposedChart } from "@/components/evilcharts/charts/recharts-composed-chart";
import { ChartTooltip, ChartTooltipContent } from "@/components/evilcharts/ui/recharts-tooltip";
import { chartTheme } from "@/lib/chart-theme";
import { pct } from "@/lib/fmt";
import type { Calibration } from "@/lib/types";
import { cn } from "@/lib/utils";
import { LOW_N } from "./reliability-spark";

type Bin = Calibration["bins"][number];
type Seen = Bin & { mean_confidence: number; accuracy: number }; // buckets with decisions (null otherwise)
type Row = { x: number; solid: number | null; ghost: number | null; perfect: number; n: number; lo: number; hi: number };

const config = chartTheme({
  solid: { role: "series1", label: "Observed accuracy" },
  ghost: { role: "series2", label: "Fewer than 5 decisions" },
  perfect: { role: "shadow", label: "Perfect calibration" },
});
const TICKS = [0, 0.25, 0.5, 0.75, 1];
const MARGIN = { top: 8, right: 16, bottom: 0, left: 0 };

/**
 * Reliability diagram: observed accuracy per confidence bucket against the dashed perfect diagonal (Evil composed).
 * The line joins only buckets with 5+ decisions; thinner ones are hollow dots off the line. Dot size follows n,
 * and every dot links to the misses behind it. Empty buckets are not drawn.
 */
export function ReliabilityChart({ bins, href, className }: { bins: Bin[]; href: (b: Bin) => string; className?: string }) {
  const pts = bins.filter((b): b is Seen => b.n > 0 && b.mean_confidence !== null && b.accuracy !== null);
  const nmax = Math.max(1, ...pts.map((b) => b.n));
  const rows: Row[] = [
    { x: 0, solid: null, ghost: null, perfect: 0, n: 0, lo: 0, hi: 0 },
    ...pts.map((b) => ({ x: b.mean_confidence, solid: b.n >= LOW_N ? b.accuracy : null, ghost: b.n < LOW_N ? b.accuracy : null, perfect: b.mean_confidence, n: b.n, lo: b.lo, hi: b.hi })),
    { x: 1, solid: null, ghost: null, perfect: 1, n: 0, lo: 1, hi: 1 },
  ];
  const byLo = new Map(pts.map((b) => [b.lo, b]));
  // One dot renderer per series: each draws only its own buckets, as a link to their misses.
  const dot = (ghost: boolean) => function renderDot(d: { cx?: number; cy?: number; payload: Row }) {
    const b = byLo.get(d.payload.lo);
    if (!b || typeof d.cx !== "number" || typeof d.cy !== "number" || (b.n < LOW_N) !== ghost) return <g key={d.payload.lo} />;
    const r = 3.5 + 6 * Math.sqrt(b.n / nmax);
    return (
      <Link key={b.lo} href={href(b)} aria-label={`Confidence ${pct(b.lo)} to ${pct(b.hi)}: accuracy ${pct(b.accuracy, 1)}, n=${b.n}. See the misses.`} className="group cursor-pointer outline-none">
        <circle cx={d.cx} cy={d.cy} r={Math.max(r, 12)} className="fill-transparent" />
        <circle
          cx={d.cx}
          cy={d.cy}
          r={r}
          strokeWidth={1.5}
          className={cn(
            "origin-center [transform-box:fill-box] group-hover:scale-125 group-focus-visible:scale-125 group-focus-visible:stroke-ring motion-safe:transition-transform motion-safe:duration-150 motion-safe:ease-settle",
            ghost ? "fill-card stroke-muted-foreground" : "fill-foreground stroke-background",
          )}
        />
      </Link>
    );
  };

  return (
    <EvilComposedChart data={rows} config={config} className={cn("aspect-[3/2]", className)} chartProps={{ margin: MARGIN }}>
      <EvilComposedChart.Grid vertical />
      <EvilComposedChart.XAxis dataKey="x" type="number" domain={[0, 1]} ticks={TICKS} tickFormatter={(v: number) => `${Math.round(v * 100)}%`} />
      <EvilComposedChart.YAxis type="number" domain={[0, 1]} ticks={TICKS} width={48} tickFormatter={(v: number) => `${Math.round(v * 100)}%`} />
      <ChartTooltip
        cursor={{ strokeDasharray: "3 3" }}
        content={(p) => {
          const row = p.payload?.[0]?.payload as Row | undefined;
          if (!row || row.n === 0) return null;
          return (
            <ChartTooltipContent
              {...p}
              content={undefined} // Recharts passes its own `content` prop through; the div type wants a string
              hideIndicator
              labelFormatter={() => `Confidence ${pct(row.lo)} to ${pct(row.hi)}${row.n < LOW_N ? ", too few to trust" : ""}`}
              formatter={(v) => (
                <div className="flex w-full justify-between gap-4">
                  <span className="text-muted-foreground">Accuracy</span>
                  <span className="font-mono font-medium tabular-nums">{pct(Number(v), 1)} · n={row.n}</span>
                </div>
              )}
            />
          );
        }}
      />
      <EvilComposedChart.Line dataKey="perfect" strokeVariant="dashed" lineProps={{ tooltipType: "none", legendType: "none" }} />
      <EvilComposedChart.Line dataKey="solid" connectNulls lineProps={{ activeDot: false, dot: dot(false) }} />
      <EvilComposedChart.Line dataKey="ghost" lineProps={{ strokeWidth: 0, activeDot: false, dot: dot(true) }} />
    </EvilComposedChart>
  );
}
