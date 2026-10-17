"use client";

import Link from "next/link";
import { EvilComposedChart } from "@/components/evilcharts/charts/recharts-composed-chart";
import { ChartTooltip, ChartTooltipContent } from "@/components/evilcharts/ui/recharts-tooltip";
import { chartTheme } from "@/lib/chart-theme";
import { pct } from "@/lib/fmt";
import type { Calibration } from "@/lib/types";
import { cn } from "@/lib/utils";

type Bin = Calibration["bins"][number];
type Row = { x: number; observed: number | null; perfect: number; n: number; lo: number; hi: number };

const config = chartTheme({ observed: { role: "series1", label: "Observed accuracy" }, perfect: { role: "shadow", label: "Perfect calibration" } });
const TICKS = [0, 0.25, 0.5, 0.75, 1];
const MARGIN = { top: 8, right: 16, bottom: 0, left: 0 };
const LOW_N = 5; // below this a bucket is drawn faint: too few decisions to trust

/**
 * Reliability diagram: observed accuracy per confidence bucket against the dashed perfect diagonal (Evil composed).
 * Dot size follows n, faint dots have fewer than 5 decisions, and every dot links to the misses behind it.
 */
export function ReliabilityChart({ bins, href, className }: { bins: Bin[]; href: (b: Bin) => string; className?: string }) {
  const pts = bins.filter((b) => b.n > 0);
  const nmax = Math.max(1, ...pts.map((b) => b.n));
  const rows: Row[] = [
    { x: 0, observed: null, perfect: 0, n: 0, lo: 0, hi: 0 },
    ...pts.map((b) => ({ x: b.mean_confidence, observed: b.accuracy, perfect: b.mean_confidence, n: b.n, lo: b.lo, hi: b.hi })),
    { x: 1, observed: null, perfect: 1, n: 0, lo: 1, hi: 1 },
  ];
  const byLo = new Map(pts.map((b) => [b.lo, b]));

  return (
    <EvilComposedChart
      data={rows as Record<string, number | null>[]} // chartTheme() returns a loose ChartConfig, so rows are typed loosely too
      config={config}
      className={cn("aspect-[4/3]", className)}
      chartProps={{ margin: MARGIN }}
    >
      <EvilComposedChart.Grid vertical />
      <EvilComposedChart.XAxis dataKey="x" type="number" domain={[0, 1]} ticks={TICKS} tickFormatter={(v: number) => `${Math.round(v * 100)}%`} />
      <EvilComposedChart.YAxis type="number" domain={[0, 1]} ticks={TICKS} width={48} tickFormatter={(v: number) => `${Math.round(v * 100)}%`} />
      <ChartTooltip
        cursor={{ strokeDasharray: "3 3" }}
        content={(p) => {
          const row = p.payload?.[0]?.payload as Row | undefined;
          if (!row || row.observed === null) return null;
          return (
            <ChartTooltipContent
              {...p}
              content={undefined} // Recharts passes its own `content` prop through; the div type wants a string
              hideIndicator
              labelFormatter={() => `Confidence ${pct(row.lo)} to ${pct(row.hi)}`}
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
      <EvilComposedChart.Line
        dataKey="observed"
        connectNulls
        lineProps={{
          activeDot: false,
          dot: (d: { cx?: number; cy?: number; payload: Row }) => {
            const b = byLo.get(d.payload.lo);
            if (!b || d.cx === undefined || d.cy === undefined) return <g key={d.payload.lo} />;
            return (
              <Link key={b.lo} href={href(b)} aria-label={`Confidence ${pct(b.lo)} to ${pct(b.hi)}: accuracy ${pct(b.accuracy, 1)}, n=${b.n}. See the misses.`}>
                <circle
                  cx={d.cx}
                  cy={d.cy}
                  r={3.5 + 6 * Math.sqrt(b.n / nmax)}
                  strokeWidth={1.5}
                  fillOpacity={b.n < LOW_N ? 0.35 : 0.9}
                  className="origin-center cursor-pointer fill-foreground stroke-background [transform-box:fill-box] hover:scale-125 motion-safe:transition-transform motion-safe:duration-150 motion-safe:ease-settle"
                />
              </Link>
            );
          },
        }}
      />
    </EvilComposedChart>
  );
}
