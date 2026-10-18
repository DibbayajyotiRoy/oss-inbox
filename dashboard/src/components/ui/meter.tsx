import { cn } from "@/lib/utils"

const STATES = {
  acted: { name: "Jev acts", fill: "bg-chart-acted" },
  queued: { name: "needs review", fill: "bg-chart-queued" },
  // Shadow = soft amber stripes: a hatched fill that reads as "would have, didn't" (the tick is a solid, deeper amber).
  shadow: {
    name: "learning",
    fill: "bg-[repeating-linear-gradient(90deg,color-mix(in_oklab,var(--chart-shadow)_75%,transparent)_0_3px,transparent_3px_6px)]",
  },
} as const

export type MeterState = keyof typeof STATES

const clamp = (n: number) => Math.min(1, Math.max(0, n))
const pct = (n: number) => `${Math.round(clamp(n) * 100)}%`

/**
 * The signature atom: a confidence reading (0..1) against its threshold tick (--tick).
 * Fill and tick settle like a needle (250ms spring, ~2% overshoot) when `value` or `threshold` change.
 * `state` defaults to acted when value >= threshold, else queued; pass `shadow` for a would-have-acted reading.
 * `value: null` is an unmeasured reading: empty track, "–".
 * `hideLabel` keeps `label` as the accessible name but does not print it (the column header already says it).
 * `valueText` replaces the printed reading and what is announced, e.g. "94% · n=212".
 * `sm` is one line for list rows; `md` adds a header row for detail views.
 */
export function Meter({
  value,
  threshold,
  state,
  label,
  hideLabel,
  valueText,
  size = "sm",
  className,
}: {
  value: number | null
  threshold?: number
  state?: MeterState
  label?: string
  hideLabel?: boolean
  valueText?: string
  size?: "sm" | "md"
  className?: string
}) {
  const s = state ?? (threshold !== undefined && value !== null && value >= threshold ? "acted" : "queued")
  const md = size === "md"
  const text = valueText ?? (value === null ? "–" : pct(value))

  const track = (
    <div
      role="meter"
      aria-label={label ?? "How sure"}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={value === null ? undefined : Math.round(clamp(value) * 100)}
      aria-valuetext={`${value === null ? "not checked yet" : `${text}, ${STATES[s].name}`}${threshold !== undefined ? `, needs ${pct(threshold)}` : ""}`}
      data-slot="meter"
      data-state={s}
      className={cn("relative rounded-full bg-muted", md ? "h-2 w-full" : "h-1.5 min-w-16 flex-1")}
    >
      <div className="absolute inset-0 overflow-hidden rounded-full">
        <div
          className={cn("h-full rounded-full motion-safe:transition-[width] motion-safe:duration-250 motion-safe:ease-needle", STATES[s].fill)}
          style={{ width: `${clamp(value ?? 0) * 100}%` }}
        />
      </div>
      {threshold !== undefined ? (
        <div
          aria-hidden
          data-slot="meter-threshold"
          className={cn(
            "absolute w-0.5 -translate-x-1/2 rounded-full bg-tick motion-safe:transition-[left] motion-safe:duration-250 motion-safe:ease-needle",
            md ? "-inset-y-1" : "-inset-y-0.5"
          )}
          style={{ left: `${clamp(threshold) * 100}%` }}
        />
      ) : null}
    </div>
  )

  if (!md)
    return (
      <div className={cn("flex items-center gap-2", className)}>
        {label && !hideLabel ? <span className="max-w-28 truncate text-xs text-muted-foreground">{label}</span> : null}
        {track}
        <span className="min-w-9 text-right text-xs font-medium tabular-nums">{text}</span>
      </div>
    )

  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <div className="flex items-baseline justify-between gap-3 text-[13px]">
        {hideLabel ? null : <span className="truncate text-muted-foreground">{label ?? "How sure"}</span>}
        <span className="ml-auto shrink-0 tabular-nums">
          <span className="text-sm font-medium">{text}</span>
          {threshold !== undefined ? <span className="text-muted-foreground"> · needs {pct(threshold)}</span> : null}
        </span>
      </div>
      {track}
    </div>
  )
}
