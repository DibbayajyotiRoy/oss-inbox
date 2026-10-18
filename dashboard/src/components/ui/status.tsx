import * as React from "react"
import { Ban, Check, CircleX, Clock, LoaderCircle, TriangleAlert, type LucideIcon } from "lucide-react"

import { cn } from "@/lib/utils"

/**
 * A state as icon + text, never colour alone, on a tinted chip (10% fill, 30% inset ring, like Badge tones).
 * success = done well, danger = failed or wrong, warning = needs attention,
 * progress = happening now (spinning, brand), waiting = not started, neutral = ended on purpose (both slate).
 */
const TONES = {
  success: { cls: "bg-success/10 text-success ring-success/30", icon: Check },
  danger: { cls: "bg-destructive/10 text-destructive ring-destructive/30", icon: CircleX },
  warning: { cls: "bg-warning/10 text-warning ring-warning/30", icon: TriangleAlert },
  progress: { cls: "bg-primary/10 text-brand ring-primary/30", icon: LoaderCircle },
  waiting: { cls: "bg-muted-foreground/10 text-foreground/70 ring-muted-foreground/30", icon: Clock },
  neutral: { cls: "bg-muted-foreground/10 text-foreground/70 ring-muted-foreground/30", icon: Ban },
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
    <span data-slot="status" data-tone={tone} className={cn("-mx-1.5 -my-0.5 inline-flex items-center gap-1.5 rounded-md px-1.5 py-0.5 text-[13px] font-medium ring-1 ring-inset", TONES[tone].cls, className)}>
      <Icon aria-hidden className={cn("size-3.5 shrink-0", tone === "progress" && !icon && "motion-safe:animate-spin")} />
      {children}
    </span>
  )
}
