"use client";

import { ChevronsLeftRight } from "lucide-react";
import { useMotionValueEvent, useReducedMotion, useSpring } from "motion/react";
import { memo, useEffect, useState, type KeyboardEvent } from "react";
import { ReferenceArea, ReferenceLine } from "recharts";
import { EvilAreaChart } from "@/components/evilcharts/charts/recharts-area-chart";
import { chartTheme } from "@/lib/chart-theme";
import { cn } from "@/lib/utils";

/** One confidence bucket of the history, as stacked counts. */
export type Bin = { x: number; wrong: number; correct: number; unlabeled: number };

export const MIN = 0.5;
export const MAX = 0.99;
export const snap = (v: number) => Math.min(MAX, Math.max(MIN, Math.round(v * 100) / 100));

const PAD = 14; // chart side margin: the overlay slider and the pill are laid out against it
const THUMB = 40; // transparent hit area of the native thumb (a finger-sized column)
const SPAN = (MAX - MIN) / (1 - MIN); // share of the plot the slider travels
const MARGIN = { top: 30, right: PAD, bottom: 0, left: PAD };
const TICKS = [0.5, 0.6, 0.7, 0.8, 0.9, 1];
const config = chartTheme({ wrong: "Wrong", correct: { role: "series2", label: "Correct" }, unlabeled: { role: "series4", label: "Unlabeled" } });
let introPlayed = false; // the wipe-in plays once per visit, not on every question switch

/** The tick's displayed position: a short spring (~2% overshoot, ~250ms) for keys and buttons, direct while dragging. */
function useNeedle(value: number, dragging: boolean) {
  const reduce = useReducedMotion();
  const spring = useSpring(value, { stiffness: 520, damping: 36 });
  const [sprung, setSprung] = useState(value);
  useMotionValueEvent(spring, "change", (v) => !dragging && setSprung(v));
  useEffect(() => {
    if (reduce || dragging) spring.jump(value);
    else spring.set(value);
  }, [value, reduce, dragging, spring]);
  return reduce || dragging ? value : sprung;
}

/**
 * The signature: the confidence distribution (Evil area, stacked wrong / correct / unlabeled) with the threshold as a
 * Recharts ReferenceLine. A transparent native range input covers the plot, so dragging anywhere, touch, and the arrow
 * keys (Shift or Page keys = 5 points) all work and are announced for free.
 */
export const ThresholdChart = memo(function ThresholdChart({
  bins,
  value,
  onChange,
  recommended,
  label,
  describedBy,
}: {
  bins: Bin[];
  value: number;
  onChange: (v: number) => void;
  recommended?: number | null;
  label: string;
  describedBy?: string;
}) {
  const [dragging, setDragging] = useState(false);
  const shown = Math.min(1, Math.max(MIN, useNeedle(value, dragging)));
  const [intro] = useState(() => !introPlayed);
  useEffect(() => {
    introPlayed = true;
  }, []);
  const frac = (shown - MIN) / (1 - MIN);
  const at = `calc(${PAD}px + (100% - ${2 * PAD}px) * ${frac})`;

  function key(e: KeyboardEvent<HTMLInputElement>) {
    const dir = ["ArrowRight", "ArrowUp", "PageUp"].includes(e.key) ? 1 : ["ArrowLeft", "ArrowDown", "PageDown"].includes(e.key) ? -1 : 0;
    if (!dir || !(e.shiftKey || e.key.startsWith("Page"))) return; // plain arrows keep the native 1 point step
    e.preventDefault();
    onChange(snap(value + dir * 0.05));
  }
  function down() {
    setDragging(true);
    for (const ev of ["pointerup", "pointercancel"]) addEventListener(ev, () => setDragging(false), { once: true });
  }

  return (
    <div className="relative h-64">
      <EvilAreaChart
        data={bins as Record<string, number>[]} // chartTheme() returns a loose ChartConfig, so rows are typed loosely too
        config={config}
        stackType="stacked"
        curveType="monotone"
        animationType={intro ? "left-to-right" : "none"}
        className="aspect-auto h-full"
        chartProps={{ margin: MARGIN }}
      >
        <EvilAreaChart.Grid />
        <EvilAreaChart.XAxis dataKey="x" type="number" domain={[MIN, 1]} ticks={TICKS} tickFormatter={(v: number) => `${Math.round(v * 100)}%`} />
        <ReferenceArea x1={shown} x2={1} fill="var(--foreground)" fillOpacity={0.05} stroke="none" />
        <EvilAreaChart.Area dataKey="wrong" variant="solid" strokeVariant="solid" strokeWidth={1.5} />
        <EvilAreaChart.Area dataKey="correct" variant="lines" strokeVariant="solid" strokeWidth={1.5} />
        <EvilAreaChart.Area dataKey="unlabeled" variant="hatched" strokeVariant="dashed" />
        {recommended != null && <ReferenceLine x={recommended} stroke="var(--warning)" strokeDasharray="4 4" strokeOpacity={0.7} />}
        <ReferenceLine x={shown} stroke="var(--warning)" strokeWidth={2} />
      </EvilAreaChart>

      <input
        type="range"
        min={MIN}
        max={MAX}
        step={0.01}
        value={Math.min(MAX, Math.max(MIN, value))}
        onChange={(e) => onChange(snap(Number(e.target.value)))}
        onKeyDown={key}
        onPointerDown={down}
        aria-label={label}
        aria-describedby={describedBy}
        aria-valuetext={`${Math.round(value * 100)}%`}
        style={{ left: PAD - THUMB / 2, width: `calc((100% - ${2 * PAD}px) * ${SPAN} + ${THUMB}px)` }}
        className={cn(
          "peer absolute inset-y-0 cursor-ew-resize touch-pan-y appearance-none bg-transparent outline-none",
          // Touch: only the tick is grabbable, so a vertical swipe over the chart scrolls the page instead of moving the threshold.
          "pointer-coarse:pointer-events-none pointer-coarse:[&::-webkit-slider-thumb]:pointer-events-auto pointer-coarse:[&::-moz-range-thumb]:pointer-events-auto",
          "[&::-webkit-slider-runnable-track]:h-64 [&::-webkit-slider-runnable-track]:bg-transparent",
          "[&::-webkit-slider-thumb]:h-64 [&::-webkit-slider-thumb]:w-10 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:border-0 [&::-webkit-slider-thumb]:bg-transparent",
          "[&::-moz-range-track]:bg-transparent [&::-moz-range-thumb]:h-64 [&::-moz-range-thumb]:w-10 [&::-moz-range-thumb]:rounded-none [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:bg-transparent",
        )}
      />
      <div
        aria-hidden
        style={{ left: at }}
        className="pointer-events-none absolute top-1 flex -translate-x-1/2 items-center gap-1 rounded-md bg-warning px-1.5 py-0.5 text-xs font-semibold text-primary-foreground tabular-nums shadow-sm peer-focus-visible:ring-2 peer-focus-visible:ring-ring peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-card"
      >
        <ChevronsLeftRight className="size-3" />
        {Math.round(shown * 100)}%
        <span className={cn("absolute right-full mr-2 whitespace-nowrap font-normal text-muted-foreground motion-safe:transition-opacity motion-safe:duration-150", frac < 0.18 && "opacity-0")}>Queued</span>
        <span className={cn("absolute left-full ml-2 whitespace-nowrap font-normal text-muted-foreground motion-safe:transition-opacity motion-safe:duration-150", frac > 0.82 && "opacity-0")}>Auto-acted</span>
      </div>
    </div>
  );
});
