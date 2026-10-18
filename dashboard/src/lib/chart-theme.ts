import type { ChartConfig } from "@/components/evilcharts/ui/recharts-chart";

/**
 * Semantic chart roles -> light/dark hex (DESIGN.md palette). Evil Charts needs literal colours per theme, so
 * these mirror the CSS tokens: acted = foreground, queued = muted-foreground, wrong = destructive,
 * threshold = warning, series1..5 = the graphite ramp (--chart-1..5). Shadow is foreground at 40%:
 * draw it dashed too (`strokeDasharray` / dashed variant) so it never relies on tint alone.
 * For SVG strokes outside the config (a threshold ReferenceLine) use the CSS var: `stroke="var(--warning)"`.
 */
const ROLES = {
  acted: { light: "#1c2024", dark: "#edeef0" },
  queued: { light: "#60646c", dark: "#b0b4ba" },
  shadow: { light: "#1c202466", dark: "#edeef066" },
  wrong: { light: "#a63636", dark: "#e8817a" },
  threshold: { light: "#7e5616", dark: "#dcb36c" },
  series1: { light: "#1c2024", dark: "#edeef0" },
  series2: { light: "#60646c", dark: "#b0b4ba" },
  series3: { light: "#8b8d98", dark: "#777b84" },
  series4: { light: "#b9bbc6", dark: "#5a6169" },
  series5: { light: "#d9d9e0", dark: "#43484e" },
} as const;

export type ChartRole = keyof typeof ROLES;

// Black or white, whichever has more contrast on the hex (WCAG luminance; the two tie at L = 0.179).
const onFill = (hex: string) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.179 ? "#111113" : "#fcfcfd";
};

/** Readable text colour per theme for a label drawn on top of a role's fill (bar segment labels). */
export const ink = (role: ChartRole) => ({ light: onFill(ROLES[role].light), dark: onFill(ROLES[role].dark) });

type Spec = string | { role: ChartRole; label: string };

/**
 * ChartConfig for Evil Charts from a `{ dataKey: label }` map. The result keeps the keys you pass, so Evil Charts can
 * check them against the data rows. A key that is a role name gets that role's
 * colour; any other key takes the next graphite series colour, or pass `{ role, label }` to choose.
 *
 *   chartTheme({ acted: "Auto-acted", queued: "Queued", wrong: "Wrong" })
 *   chartTheme({ score: "Score", baseline: { role: "series3", label: "Baseline" } })
 */
export function chartTheme<K extends string>(series: Record<K, Spec>): Record<K, ChartConfig[string]> {
  let next = 0;
  return Object.fromEntries(
    Object.entries<Spec>(series).map(([key, spec]) => {
      const { role, label } = typeof spec === "string" ? { role: key in ROLES ? (key as ChartRole) : (`series${++next}` as ChartRole), label: spec } : spec;
      return [key, { label, colors: { light: [ROLES[role].light], dark: [ROLES[role].dark] } }];
    }),
  ) as Record<K, ChartConfig[string]>;
}
