import Link from "next/link";
import type { Calibration, RepoCard } from "@/lib/types";

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

/** Reliability diagram: x = mean confidence, y = accuracy, dot area ~ n. Each dot links to `href(bin)`. */
export function Reliability({ bins, href }: { bins: Calibration["bins"]; href: (b: Calibration["bins"][number]) => string }) {
  const S = 280, M = 36, W = S - 2 * M;
  const x = (v: number) => M + v * W;
  const y = (v: number) => S - M - v * W;
  const pts = bins.filter((b) => b.n > 0);
  const nmax = Math.max(1, ...pts.map((b) => b.n));
  return (
    <svg viewBox={`0 0 ${S} ${S}`} className="w-full max-w-xs" role="img"
      aria-label={`Reliability diagram: ${pts.length} populated confidence buckets. Dots on the dashed diagonal are perfectly calibrated.`}>
      <rect x={M} y={M} width={W} height={W} className="fill-none stroke-line" />
      {[0, 0.5, 1].map((v) => (
        <g key={v} className="fill-muted text-[10px]">
          <text x={x(v)} y={S - M + 14} textAnchor="middle">{v}</text>
          <text x={M - 6} y={y(v) + 3} textAnchor="end">{v}</text>
        </g>
      ))}
      <text x={S / 2} y={S - 4} textAnchor="middle" className="fill-muted text-[10px]">mean confidence</text>
      <text transform={`translate(10 ${S / 2}) rotate(-90)`} textAnchor="middle" className="fill-muted text-[10px]">accuracy</text>
      <line x1={x(0)} y1={y(0)} x2={x(1)} y2={y(1)} strokeDasharray="4 3" className="stroke-muted" />
      <polyline fill="none" className="stroke-accent" strokeOpacity={0.5} points={pts.map((b) => `${x(b.mean_confidence)},${y(b.accuracy)}`).join(" ")} />
      {pts.map((b) => (
        <Link key={b.lo} href={href(b)}>
          <circle cx={x(b.mean_confidence)} cy={y(b.accuracy)} r={3 + 8 * Math.sqrt(b.n / nmax)} className="fill-accent stroke-accent" fillOpacity={0.45}>
            <title>{`confidence ${b.lo}–${b.hi}: accuracy ${(b.accuracy * 100).toFixed(0)}% (n=${b.n}). Click for the misses.`}</title>
          </circle>
        </Link>
      ))}
    </svg>
  );
}

export type HistBin = { ok: number; bad: number; unk: number };
/** Confidence histogram over [0.5, 1] (lower values clamp into the first bin) with the threshold marked. */
export function Hist({ bins, t }: { bins: HistBin[]; t: number }) {
  const W = 300, H = 60, bw = W / bins.length;
  const max = Math.max(1, ...bins.map((b) => b.ok + b.bad + b.unk));
  return (
    <svg viewBox={`0 0 ${W} ${H + 12}`} className="w-full" role="img" aria-label={`Confidence histogram with threshold at ${t}`}>
      {bins.map((b, i) => {
        let yy = H;
        return (["ok", "bad", "unk"] as const).map((k) => {
          const h = (b[k] / max) * H;
          yy -= h;
          return h > 0 ? (
            <rect key={`${i}${k}`} x={i * bw} y={yy} width={bw - 0.5} height={h} className={k === "ok" ? "fill-ok" : k === "bad" ? "fill-bad" : "fill-line"}>
              <title>{`${(0.5 + (i * 0.5) / bins.length).toFixed(2)}+: ${k === "ok" ? "correct" : k === "bad" ? "wrong" : "unmeasured"} ${b[k]}`}</title>
            </rect>
          ) : null;
        });
      })}
      <line x1={(t - 0.5) * 2 * W} x2={(t - 0.5) * 2 * W} y1={0} y2={H} className="stroke-fg" strokeWidth={1.5} />
      <text x={0} y={H + 10} className="fill-muted text-[9px]">0.5</text>
      <text x={W} y={H + 10} textAnchor="end" className="fill-muted text-[9px]">1.0</text>
    </svg>
  );
}
