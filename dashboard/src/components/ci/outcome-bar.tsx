"use client";
import { useMemo } from "react";
import { EvilBarChart } from "@/components/evilcharts/charts/recharts-bar-chart";
import type { ChartConfig } from "@/components/evilcharts/ui/recharts-chart";
import { chartTheme } from "@/lib/chart-theme";
import type { CiOutcome, CiReport } from "@/lib/types";
import { OUTCOMES } from "./outcome";

const keys = Object.keys(OUTCOMES) as CiOutcome[];

/** One stacked bar of how the loaded reports ended. The legend carries the counts and doubles as the filter. */
export function OutcomeBar({ reports, onSelect }: { reports: CiReport[]; onSelect: (o: CiOutcome | null) => void }) {
  const { row, config } = useMemo(() => {
    const row: Record<string, string | number> = { all: "Reports" };
    for (const k of keys) row[k] = reports.filter((r) => r.outcome === k).length;
    const config = chartTheme(Object.fromEntries(keys.map((k) => [k, { role: OUTCOMES[k].role, label: `${OUTCOMES[k].label} ${row[k]}` }])));
    return { row: row as { all: string } & Record<CiOutcome, number>, config: config as Record<CiOutcome, ChartConfig[string]> };
  }, [reports]);
  return (
    <EvilBarChart
      data={[row]}
      config={config}
      layout="horizontal"
      stackType="stacked"
      barRadius={3}
      barCategoryGap={6}
      onSelectionChange={(k) => onSelect(k as CiOutcome | null)}
      // The Evil legend does not wrap on its own; let it, and give phones the extra rows.
      className="aspect-auto h-28 sm:h-20 [&_.recharts-legend-wrapper>div]:flex-wrap [&_.recharts-legend-wrapper>div]:gap-x-3 [&_.recharts-legend-wrapper>div]:gap-y-1"
      chartProps={{ margin: { top: 0, right: 0, bottom: 0, left: 0 } }}
    >
      <EvilBarChart.XAxis hide />
      <EvilBarChart.YAxis hide dataKey="all" />
      <EvilBarChart.Legend align="left" verticalAlign="bottom" isClickable />
      {keys.map((k) => (
        <EvilBarChart.Bar key={k} dataKey={k} isClickable />
      ))}
    </EvilBarChart>
  );
}
