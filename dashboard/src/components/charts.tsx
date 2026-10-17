import type { RepoCard } from "@/lib/types";

/** 30-day stacked bars: auto-acted (bottom), queued, shadow. */
export function Trend({ data }: { data: RepoCard["trend"] }) {
  const max = Math.max(1, ...data.map((d) => d.acted + d.queued + d.shadow));
  const H = 32, bw = 5;
  const sum = (k: "acted" | "queued" | "shadow") => data.reduce((a, d) => a + d[k], 0);
  return (
    <svg viewBox={`0 0 ${Math.max(1, data.length) * bw} ${H}`} preserveAspectRatio="none" className="h-8 w-full" role="img"
      aria-label={`Last ${data.length} days: ${sum("acted")} auto-acted, ${sum("queued")} queued, ${sum("shadow")} shadow`}>
      {data.map((d, i) => {
        let y = H;
        return (["acted", "queued", "shadow"] as const).map((k) => {
          const h = (d[k] / max) * (H - 1);
          y -= h;
          return h > 0 ? (
            <rect key={`${i}${k}`} x={i * bw} y={y} width={bw - 1} height={h} className={k === "acted" ? "fill-accent" : k === "queued" ? "fill-warn" : "fill-muted"}>
              <title>{`${d.date}: ${k} ${d[k]}`}</title>
            </rect>
          ) : null;
        });
      })}
    </svg>
  );
}

export const TrendLegend = () => (
  <p className="text-xs text-muted">
    <span className="text-accent">■</span> auto-acted <span className="text-warn">■</span> queued <span>■</span> shadow
  </p>
);
