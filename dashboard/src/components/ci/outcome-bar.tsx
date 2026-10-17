"use client";
import { useMemo } from "react";
import { EvilBarChart } from "@/components/evilcharts/charts/recharts-bar-chart";
import { chartTheme, type ChartRole } from "@/lib/chart-theme";
import type { CiOutcome, CiReport } from "@/lib/types";
import { OUTCOMES } from "./outcome";

const keys = Object.keys(OUTCOMES) as CiOutcome[];

/** One stacked bar of how the loaded reports ended. The legend carries the counts and doubles as the filter. */
export function OutcomeBar({ reports, onSelect }: { reports: CiReport[]; onSelect: (o: CiOutcome | null) => void }) {
  const { row, config } = useMemo(() => {
    const count = Object.fromEntries(keys.map((k) => [k, reports.filter((r) => r.outcome === k).length])) as Record<CiOutcome, number>;
    const spec = Object.fromEntries(keys.map((k) => [k, { role: OUTCOMES[k].role, label: `${OUTCOMES[k].label} ${count[k]}` }])) as Record<CiOutcome, { role: ChartRole; label: string }>;
    return { row: { all: "Reports", ...count }, config: chartTheme(spec) };
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
      className="aspect-auto h-28 sm:h-20" // phones get the extra legend rows
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
