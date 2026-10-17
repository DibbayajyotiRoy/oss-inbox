import * as React from "react"

import { cn } from "@/lib/utils"
import { Label } from "./label"
import { FadePresence } from "./presence"

export interface FieldProps {
  label: React.ReactNode
  htmlFor: string
  error?: string | null
  hint?: React.ReactNode
  /**
   * `below` (default): the hint sits under the control. `inline`: a short hint
   * sits on the label's line, after a dot, muted and at the label's size, so
   * it takes no height and nothing moves when it comes or goes. Errors always
   * go below.
   */
  hintPlacement?: "below" | "inline"
  children: React.ReactNode
  className?: string
}

const DESC = "text-[13px] text-muted-foreground"

/**
 * Label + control + hint/error. Give the control `id={htmlFor}` and, for
 * screen readers, `aria-describedby={`${htmlFor}-desc`}` and `aria-invalid={!!error}`.
 * Hints and errors fade and collapse in and out (FadePresence, §8).
 */
export function Field({ label, htmlFor, error, hint, hintPlacement = "below", children, className }: FieldProps) {
  const descId = `${htmlFor}-desc`
  const inline = hintPlacement === "inline"
  const below = error ? "error" : hint && !inline ? "hint" : null
  return (
    <div className={cn("flex flex-col gap-2", className)}>
      {inline ? (
        <div className="flex min-w-0 items-baseline gap-1.5">
          <Label htmlFor={htmlFor} className="shrink-0 text-[13px]">
            {label}
          </Label>
          <FadePresence show={!!hint && !error} as="span" mode="fade" className={cn("min-w-0 truncate leading-none", DESC)}>
            <span aria-hidden>· </span>
            <span id={descId}>{hint}</span>
          </FadePresence>
        </div>
      ) : (
        <Label htmlFor={htmlFor} className="text-[13px]">
          {label}
        </Label>
      )}
      {children}
      {/* -mt-2 + pt-2 fold the column gap into the collapsing box, so it opens and closes too. */}
      <FadePresence show={below != null} mode="collapse" className="-mt-2">
        {below === "error" ? (
          <p key="error" id={descId} role="alert" className="pt-2 text-[13px] text-destructive">
            {error}
          </p>
        ) : (
          <p key="hint" id={descId} className={cn("pt-2", DESC)}>
            {hint}
          </p>
        )}
      </FadePresence>
    </div>
  )
}
