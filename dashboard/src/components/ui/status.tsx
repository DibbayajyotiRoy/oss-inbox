import * as React from "react"
import { Ban, Check, CircleX, Clock, LoaderCircle, TriangleAlert, type LucideIcon } from "lucide-react"

import { cn } from "@/lib/utils"

/**
 * A state as icon + text, never colour alone (DESIGN.md: status is not a pill).
 * success = done well, danger = failed or wrong, warning = needs attention,
 * progress = happening now (spinning, no hue), waiting = not started, neutral = ended on purpose.
 */
const TONES = {
  success: { cls: "text-success", icon: Check },
  danger: { cls: "text-destructive", icon: CircleX },
  warning: { cls: "text-warning", icon: TriangleAlert },
  progress: { cls: "text-foreground", icon: LoaderCircle },
  waiting: { cls: "text-muted-foreground", icon: Clock },
  neutral: { cls: "text-muted-foreground", icon: Ban },
} satisfies Record<string, { cls: string; icon: LucideIcon }>

export type StatusTone = keyof typeof TONES

export function Status({
  tone,
  icon,
  children,
  className,
}: {
  tone: StatusTone
  /** Override the tone's default icon. */
  icon?: LucideIcon
  children: React.ReactNode
  className?: string
}) {
  const Icon = icon ?? TONES[tone].icon
  return (
    <span data-slot="status" data-tone={tone} className={cn("inline-flex items-center gap-1.5 text-[13px] font-medium", TONES[tone].cls, className)}>
      <Icon aria-hidden className={cn("size-3.5 shrink-0", tone === "progress" && !icon && "motion-safe:animate-spin")} />
      {children}
    </span>
  )
}
