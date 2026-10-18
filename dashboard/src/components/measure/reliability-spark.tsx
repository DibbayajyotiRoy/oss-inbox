import type { Calibration } from "@/lib/types";
import { cn } from "@/lib/utils";

/** A confidence bucket with fewer decisions than this is drawn hollow and kept off the line: too few to trust. */
export const LOW_N = 5;

const S = 32; // box
const P = 3; // padding inside it
const at = (v: number) => P + v * (S - 2 * P);

/** A reliability diagram at row size: the dashed perfect diagonal, a line through buckets with 5+ decisions, hollow dots for the rest. */
export function ReliabilitySpark({ bins, className }: { bins: Calibration["bins"]; className?: string }) {
  const pts = bins.flatMap((b) => (b.mean_confidence === null || b.accuracy === null ? [] : [{ x: at(b.mean_confidence), y: S - at(b.accuracy), n: b.n }]));
  const nmax = Math.max(1, ...pts.map((p) => p.n));
  return (
    <svg aria-hidden viewBox={`0 0 ${S} ${S}`} className={cn("size-8 shrink-0", className)}>
      <rect x={P} y={P} width={S - 2 * P} height={S - 2 * P} rx={1} className="fill-none stroke-border" />
      <path d={`M${P} ${S - P}L${S - P} ${P}`} strokeDasharray="2 2" className="fill-none stroke-muted-foreground" />
      <polyline points={pts.filter((p) => p.n >= LOW_N).map((p) => `${p.x},${p.y}`).join(" ")} strokeWidth={1.25} strokeLinejoin="round" className="fill-none stroke-chart-1" />
      {pts.map((p, i) => (
        <circle key={i} cx={p.x} cy={p.y} r={1.2 + 1.6 * Math.sqrt(p.n / nmax)} className={cn("stroke-chart-1", p.n >= LOW_N ? "fill-chart-1" : "fill-card")} />
      ))}
    </svg>
  );
}
