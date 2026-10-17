"use client"

import * as React from "react"
import { Info } from "lucide-react"

import { cn } from "@/lib/utils"
import { Tooltip, TooltipContent, TooltipTrigger } from "./tooltip"

export interface InfoHintProps {
  /** The explanation, shown on hover or keyboard focus. Keep it to one or two short sentences. */
  children: React.ReactNode
  /** Accessible name of the trigger ("About credits used"). Defaults to "More info". */
  label?: string
  side?: "top" | "right" | "bottom" | "left"
  className?: string
}

/**
 * The (i) next to a title or label, for an explanation that matters but would
 * be noise as a visible line (docs/DESIGN.md §10, copy budget). One per
 * heading at most; never for text that prevents a costly mistake, which stays
 * visible.
 */
export function InfoHint({ children, label = "More info", side = "top", className }: InfoHintProps) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label={label}
          className={cn(
            "relative inline-flex size-4 shrink-0 translate-y-[-1px] items-center justify-center rounded-sm align-middle text-muted-foreground outline-none after:absolute after:-inset-1.5 hover:text-foreground focus-visible:text-foreground focus-visible:ring-2 focus-visible:ring-ring motion-safe:transition-colors motion-safe:duration-150",
            className,
          )}
        >
          <Info aria-hidden className="size-3.5" />
        </button>
      </TooltipTrigger>
      <TooltipContent side={side} sideOffset={4} className="max-w-72 text-pretty">
        {children}
      </TooltipContent>
    </Tooltip>
  )
}

/** A title with an optional InfoHint after it, on one line. */
export function TitleWithHint({
  children,
  hint,
  hintLabel,
}: {
  children: React.ReactNode
  hint?: React.ReactNode
  hintLabel?: string
}) {
  if (!hint) return <>{children}</>
  return (
    <span className="inline-flex min-w-0 items-center gap-1.5">
      <span className="min-w-0">{children}</span>
      <InfoHint label={hintLabel}>{hint}</InfoHint>
    </span>
  )
}
