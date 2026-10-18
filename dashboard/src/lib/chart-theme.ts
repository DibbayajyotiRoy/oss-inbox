import type { ChartConfig } from "@/components/evilcharts/ui/recharts-chart";

/**
 * Semantic chart roles -> light/dark hex. Evil Charts needs literal colours per theme, so these mirror the CSS tokens in
 * globals.css (--chart-acted etc.): acted = green, queued = blue, shadow = soft amber, wrong = red, unlabeled = slate,
 * threshold = the tick's deep amber (--tick), series1..5 = the categorical ramp (--chart-1..5: brand, teal, amber, rose, sky).
 * Shadow is a softer amber than the tick: draw it hatched or dashed too (`variant="hatched"`, `strokeVariant="dashed"`)
 * so it never relies on hue alone. Every hex is >= 3:1 on the card in its theme.
 * For SVG strokes outside the config (a threshold ReferenceLine) use the CSS var: `stroke="var(--tick)"`.
 */
const ROLES = {
  acted: { light: "#1a9560", dark: "#3dd68c" },
  queued: { light: "#2b7de6", dark: "#5aaeff" },
  shadow: { light: "#b87d12", dark: "#bf8f2e" },
  wrong: { light: "#d6393b", dark: "#f2777a" },
  unlabeled: { light: "#8b8d98", dark: "#8b8d98" },
  threshold: { light: "#a65a00", dark: "#ffc53d" },
  series1: { light: "#5b5bd6", dark: "#8f8dfa" },
  series2: { light: "#0f9e96", dark: "#3ecfc5" },
  series3: { light: "#c97f00", dark: "#f5b942" },
  series4: { light: "#d93a74", dark: "#f2709c" },
  series5: { light: "#1f93d6", dark: "#5ec4f5" },
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
 * colour; any other key takes the next categorical series colour, or pass `{ role, label }` to choose.
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
