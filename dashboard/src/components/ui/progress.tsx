"use client"

import * as React from "react"
import { Progress as ProgressPrimitive } from "radix-ui"

import { cn } from "@/lib/utils"

// shadcn/ui Progress; the bar eases to new values (transform only).
function Progress({
  className,
  value,
  label,
  ...props
}: React.ComponentProps<typeof ProgressPrimitive.Root> & { label?: string }) {
  const v = Math.max(0, Math.min(100, Number.isFinite(value) ? Number(value) : 0))
  return (
    <ProgressPrimitive.Root
      data-slot="progress"
      aria-label={label ?? props["aria-label"]}
      value={v}
      className={cn("relative h-1.5 w-full overflow-hidden rounded-full bg-muted", className)}
      {...props}
    >
      <ProgressPrimitive.Indicator
        data-slot="progress-indicator"
        className="h-full w-full flex-1 rounded-full bg-foreground/80 motion-safe:transition-transform motion-safe:duration-200 motion-safe:ease-out"
        style={{ transform: `translateX(-${100 - v}%)` }}
      />
    </ProgressPrimitive.Root>
  )
}

export { Progress }
