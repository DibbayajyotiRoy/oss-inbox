"use client"
import { useRef, type KeyboardEvent } from "react"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { indicatorMotion, useSlidingIndicator } from "@/components/ui/use-sliding-indicator"
import { NEED, type Mode, type QuestionInfo } from "@/lib/types"
import { cn } from "@/lib/utils"

const MODES: Mode[] = ["off", "shadow", "auto"]
export const MODE_LABEL: Record<Mode, string> = { off: "Off", shadow: "Learning", auto: "On" }
/** Badge variant per mode: auto green, shadow amber, off slate. */
export const MODE_VARIANT = { off: "neutral", shadow: "warning", auto: "success" } as const

// The selected mode's tone: auto green, shadow amber, off slate. Fill and text are one pair, so each reads >= 4.5:1.
const ON: Record<Mode, { text: string; fill: string }> = {
  off: { text: "text-foreground", fill: "bg-muted-foreground/15 ring-muted-foreground/30" },
  shadow: { text: "text-warning", fill: "bg-warning/15 ring-warning/30" },
  auto: { text: "text-success", fill: "bg-success/15 ring-success/30" },
}
/** Auto that is set but not measured is not acting: an amber outline instead of the green fill. */
const WAITING_FILL = "bg-warning/5 ring-warning"

/** Why Auto is not earned yet, or false. Auto needs every question of the feature measured (enough samples, accuracy at its threshold). */
export function autoReason(qs: Pick<QuestionInfo, "measured">[]): string | false {
  const done = qs.filter((q) => q.measured).length
  return !qs.length ? NEED.measured : done < qs.length && `Not ready to turn on yet (${done} of ${qs.length} ready). Check Jev on your past issues first.`
}
/** How a feature that is set to auto but not measured reads: it is not acting, so it must not look like plain auto. */
export const WAITING = "On · not ready yet"

/**
 * The off / shadow / auto choice for one feature: a radio group with a gliding fill.
 * `disabled` maps a mode to the reason it cannot be picked. The reason shows in a tooltip and the option stays
 * focusable, so keyboard users can read it; arrow keys skip it. `busy` ignores input while a change is saving.
 * `autoReason` (from `autoReason(questions)`) closes Auto until the feature is measured; a feature already on auto
 * reads "Auto · waiting for measurement" in the warning tone.
 */
export function ModeControl({ value, onChange, label, busy, disabled = {}, autoReason: unmeasured }: {
  value: Mode
  onChange: (mode: Mode) => void
  label: string
  busy?: boolean
  disabled?: Partial<Record<Mode, string | false>>
  autoReason?: string | false
}) {
  const why = (m: Mode) => disabled[m] || (m === "auto" && unmeasured)
  const list = useRef<HTMLDivElement>(null)
  const fill = useRef<HTMLSpanElement>(null)
  useSlidingIndicator(list, fill, '[role="radio"][data-state="on"]')

  function onKey(e: KeyboardEvent, i: number) {
    const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key]
    if (!step) return
    e.preventDefault()
    for (let n = 1; n <= MODES.length; n++) {
      const j = (i + step * n + 2 * MODES.length) % MODES.length
      if (why(MODES[j])) continue
      list.current?.querySelectorAll<HTMLElement>('[role="radio"]')[j]?.focus()
      return onChange(MODES[j])
    }
  }

  return (
    <div
      ref={list}
      role="radiogroup"
      aria-label={label}
      aria-busy={busy || undefined}
      className={cn("relative isolate inline-flex w-fit shrink-0 items-center gap-0.5 rounded-lg border bg-card p-0.5 motion-safe:transition-opacity motion-safe:duration-150", busy && "opacity-60")}
    >
      <span
        ref={fill}
        aria-hidden
        className={cn(indicatorMotion, "motion-safe:transition-[transform,width,opacity,background-color,box-shadow] inset-y-0.5 rounded-md ring-1 ring-inset", value === "auto" && unmeasured ? WAITING_FILL : ON[value].fill)}
      />
      {MODES.map((m, i) => {
        const on = m === value
        const reason = why(m)
        const waiting = on && m === "auto" && !!unmeasured
        const btn = (
          <button
            key={m}
            type="button"
            role="radio"
            aria-checked={on}
            aria-disabled={!!reason || busy || undefined}
            data-state={on ? "on" : "off"}
            tabIndex={on ? 0 : -1}
            onClick={() => !reason && !busy && onChange(m)}
            onKeyDown={(e) => onKey(e, i)}
            className={cn(
              "hover-pill relative h-8 rounded-md px-3 text-[13px] font-medium whitespace-nowrap outline-none focus-visible:ring-2 focus-visible:ring-ring motion-safe:transition-colors motion-safe:duration-150",
              waiting ? "text-warning" : on ? ON[m].text : "text-muted-foreground",
              reason ? cn("cursor-not-allowed", !on && "opacity-50") : !on && "hover:text-foreground",
            )}
          >
            {waiting ? WAITING : MODE_LABEL[m]}
          </button>
        )
        return reason ? (
          <Tooltip key={m}>
            <TooltipTrigger asChild>{btn}</TooltipTrigger>
            <TooltipContent>{reason}</TooltipContent>
          </Tooltip>
        ) : (
          btn
        )
      })}
    </div>
  )
}
