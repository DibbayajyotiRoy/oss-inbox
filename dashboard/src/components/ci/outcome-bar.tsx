"use client";
import { useMemo } from "react";
import { LabelList } from "recharts";
import { EvilBarChart } from "@/components/evilcharts/charts/recharts-bar-chart";
import { chartTheme, ink, type ChartRole } from "@/lib/chart-theme";
import type { CiOutcome, CiReport } from "@/lib/types";
import { OUTCOMES } from "./outcome";

const keys = Object.keys(OUTCOMES) as CiOutcome[];

type Seg = { x?: number | string; y?: number | string; width?: number | string; height?: number | string; value?: unknown };

/** "Filed 4" inside its segment when it fits, just "4" when only a number fits, nothing on slivers. Ink follows the fill, per theme. */
const segmentLabel = (k: CiOutcome) => {
  const { light, dark } = ink(OUTCOMES[k].role);
  const full = `${OUTCOMES[k].label} `;
  const SegmentLabel = ({ x, y, width, height, value }: Seg) => {
    const [w, h] = [Number(width), Number(height)];
    const text = full.length + String(value).length;
    const shown = w >= text * 6.6 + 12 ? `${full}${value}` : w >= 18 ? `${value}` : null;
    if (!Number(value) || !shown) return null;
    return (
      <text
        x={Number(x) + w / 2}
        y={Number(y) + h / 2}
        textAnchor="middle"
        dominantBaseline="central"
        className="pointer-events-none text-[11px] font-medium tabular-nums [fill:var(--l)] dark:[fill:var(--d)]"
        style={{ "--l": light, "--d": dark } as React.CSSProperties}
      >
        {shown}
      </text>
    );
  };
  return SegmentLabel;
};

const labels = Object.fromEntries(keys.map((k) => [k, segmentLabel(k)])) as Record<CiOutcome, ReturnType<typeof segmentLabel>>;

/** One stacked bar of how the loaded reports ended, each segment named in place. The legend keeps every count and doubles as the filter. */
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
        <EvilBarChart.Bar key={k} dataKey={k} isClickable barProps={{ children: <LabelList dataKey={k} content={labels[k]} /> }} />
      ))}
    </EvilBarChart>
  );
}
