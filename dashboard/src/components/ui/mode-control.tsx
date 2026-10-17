"use client"
import { useRef, type KeyboardEvent } from "react"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { indicatorMotion, useSlidingIndicator } from "@/components/ui/use-sliding-indicator"
import type { Mode } from "@/lib/types"
import { cn } from "@/lib/utils"

const MODES: Mode[] = ["off", "shadow", "auto"]
const LABEL: Record<Mode, string> = { off: "Off", shadow: "Shadow", auto: "Auto" }
/** Badge variant per mode. Colour only where Jev acts on its own; shadow is quiet, off is quieter. */
export const MODE_VARIANT = { off: "outline", shadow: "secondary", auto: "success" } as const

/**
 * The off / shadow / auto choice for one feature: a radio group with a gliding fill.
 * `disabled` maps a mode to the reason it cannot be picked. The reason shows in a tooltip and the option stays
 * focusable, so keyboard users can read it; arrow keys skip it. `busy` ignores input while a change is saving.
 */
export function ModeControl({ value, onChange, label, busy, disabled = {} }: {
  value: Mode
  onChange: (mode: Mode) => void
  label: string
  busy?: boolean
  disabled?: Partial<Record<Mode, string | false>>
}) {
  const list = useRef<HTMLDivElement>(null)
  const fill = useRef<HTMLSpanElement>(null)
  useSlidingIndicator(list, fill, '[role="radio"][data-state="on"]')

  function onKey(e: KeyboardEvent, i: number) {
    const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key]
    if (!step) return
    e.preventDefault()
    for (let n = 1; n <= MODES.length; n++) {
      const j = (i + step * n + 2 * MODES.length) % MODES.length
      if (disabled[MODES[j]]) continue
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
      <span ref={fill} aria-hidden className={cn(indicatorMotion, "inset-y-0.5 rounded-md bg-accent")} />
      {MODES.map((m, i) => {
        const on = m === value
        const reason = disabled[m]
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
              "relative h-8 rounded-md px-3 text-[13px] font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring motion-safe:transition-colors motion-safe:duration-150",
              on ? "text-foreground" : "text-muted-foreground",
              reason ? cn("cursor-not-allowed", !on && "opacity-50") : !on && "hover:text-foreground",
            )}
          >
            {LABEL[m]}
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
