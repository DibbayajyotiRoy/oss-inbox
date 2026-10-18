"use client";
import { useMemo } from "react";
import { ReferenceLine } from "recharts";
import { EvilAreaChart } from "@/components/evilcharts/charts/recharts-area-chart";
import { chartTheme } from "@/lib/chart-theme";
import type { RepoCard } from "@/lib/types";

type Key = "acted" | "queued" | "shadow";
export type TrendRow = Record<Key, number> & { date: string; day: string };

const sum = (rows: Record<Key, number>[], k: Key) => rows.reduce((a, r) => a + r[k], 0);

// `areaProps` for a tinted fill (Recharts types insist on repeating the dataKey).
const tint = (k: Key, pct: number) => ({ dataKey: k, fill: `color-mix(in oklab, var(--color-${k}-0) ${pct}%, transparent)` });

/**
 * One stack, three weights: auto-acted is the solid foreground base, queued a quieter layer above it, shadow the lightest
 * (hatched, dashed edge) so decisions that never took effect cannot outshout the ones that did. Fills are tinted past the
 * Evil defaults (10% at most) because a stack of near-transparent layers reads as one blur; Evil still dims them on selection.
 */
const areas = (width: number) => [
  <EvilAreaChart.Area key="acted" dataKey="acted" variant="solid" strokeVariant="solid" strokeWidth={width * 1.4} areaProps={tint("acted", 38)} />,
  <EvilAreaChart.Area key="queued" dataKey="queued" variant="solid" strokeVariant="solid" strokeWidth={width} areaProps={tint("queued", 20)} />,
  <EvilAreaChart.Area key="shadow" dataKey="shadow" variant="hatched" strokeVariant="dashed" strokeWidth={width * 0.8} areaProps={{ dataKey: "shadow", fillOpacity: 0.45 }} />,
];

/** 30 days of acted / queued / shadow across the org. The legend names each layer with its 30-day total and isolates it on click. */
export function TrendChart({ data, sel, onPick }: { data: TrendRow[]; sel: number | null; onPick: (i: number) => void }) {
  const config = useMemo(
    () =>
      chartTheme({
        acted: `Acted by itself ${sum(data, "acted").toLocaleString()}`,
        queued: `Needs review ${sum(data, "queued").toLocaleString()}`,
        shadow: `Learning ${sum(data, "shadow").toLocaleString()}`,
      }),
    [data],
  );
  return (
    <EvilAreaChart
      data={data}
      config={config}
      stackType="stacked"
      className="-mt-3 aspect-auto h-52 cursor-pointer sm:h-64"
      chartProps={{ onClick: (s) => s.activeIndex != null && onPick(Number(s.activeIndex)), margin: { top: 8, right: 4, bottom: 0, left: 0 } }}
    >
      <EvilAreaChart.Grid />
      <EvilAreaChart.XAxis dataKey="day" interval="preserveStartEnd" minTickGap={32} />
      <EvilAreaChart.YAxis allowDecimals={false} width={32} />
      <EvilAreaChart.Tooltip />
      <EvilAreaChart.Legend align="left" isClickable />
      {areas(1.5)}
      {sel !== null && <ReferenceLine x={data[sel].day} stroke="var(--foreground)" strokeOpacity={0.4} strokeDasharray="3 3" />}
    </EvilAreaChart>
  );
}

const sparkConfig = chartTheme({ acted: "Acted by itself", queued: "Needs review", shadow: "Learning" });

/** A repository card's 30 days, same stack without axes. */
export function Spark({ trend }: { trend: RepoCard["trend"] }) {
  return (
    <EvilAreaChart data={trend} config={sparkConfig} stackType="stacked" animationType="none" className="aspect-auto h-12" chartProps={{ margin: { top: 2, right: 0, bottom: 0, left: 0 } }}>
      {areas(1)}
    </EvilAreaChart>
  );
}
