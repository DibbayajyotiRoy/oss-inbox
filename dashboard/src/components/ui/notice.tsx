import * as React from "react"
import { Info, TriangleAlert } from "lucide-react"

import { cn } from "@/lib/utils"

const TONES = {
  info: { icon: Info, box: "bg-muted/30", mark: "text-muted-foreground", title: "" },
  warning: { icon: TriangleAlert, box: "border-warning/40 bg-warning/5", mark: "text-warning", title: "" },
  destructive: { icon: TriangleAlert, box: "border-destructive/40 bg-destructive/5", mark: "text-destructive", title: "text-destructive" },
}

/**
 * A quiet callout: `warning` for things that change what the numbers mean, `destructive` for failures
 * (announced as an alert), `info` for everything else. `action` sits at the end (below on phones).
 */
export function Notice({ tone = "info", title, children, action, className }: {
  tone?: keyof typeof TONES
  title: React.ReactNode
  children?: React.ReactNode
  action?: React.ReactNode
  className?: string
}) {
  const t = TONES[tone]
  return (
    <div role={tone === "destructive" ? "alert" : "note"} className={cn("flex flex-col gap-3 rounded-lg border p-4 sm:flex-row sm:items-center", t.box, className)}>
      <div className="flex min-w-0 flex-1 gap-3">
        <t.icon aria-hidden className={cn("mt-0.5 size-4 shrink-0", t.mark)} />
        <div className="min-w-0 text-sm">
          <p className={cn("font-medium", t.title)}>{title}</p>
          {children ? <div className="mt-0.5 text-muted-foreground">{children}</div> : null}
        </div>
      </div>
      {action}
    </div>
  )
}
