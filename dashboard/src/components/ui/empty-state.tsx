import * as React from "react"

import { cn } from "@/lib/utils"

/** Monochrome line art (currentColor, 1.5 stroke). Pick the one closest to what is missing. */
const ART = {
  inbox: (
    <>
      <path d="M12 52 22 20h52l10 32" />
      <path d="M12 52v18a4 4 0 0 0 4 4h64a4 4 0 0 0 4-4V52H62a14 14 0 0 1-28 0H12Z" />
      <path d="M36 34h24M40 43h16" opacity=".5" />
    </>
  ),
  chart: (
    <>
      <path d="M14 18v56h68" />
      <path d="M24 62 40 46l12 8 22-28" strokeDasharray="3 4" />
      <circle cx="74" cy="26" r="3" />
    </>
  ),
  done: (
    <>
      <circle cx="48" cy="48" r="32" />
      <path d="m34 49 10 10 20-22" />
    </>
  ),
} as const

export interface EmptyStateProps {
  /** At most 6 words: what is missing. */
  title: React.ReactNode
  /** Only when it stops a wrong conclusion; at most 10 words. */
  description?: React.ReactNode
  /** One action. */
  action?: React.ReactNode
  art?: keyof typeof ART
  className?: string
}

export function EmptyState({ title, description, action, art = "inbox", className }: EmptyStateProps) {
  return (
    <div data-slot="empty-state" className={cn("flex flex-col items-center justify-center px-6 py-12 text-center", className)}>
      <svg
        aria-hidden
        viewBox="0 0 96 96"
        className="mb-4 size-24 text-muted-foreground/70"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {ART[art]}
      </svg>
      <h3 className="text-[15px] font-medium text-foreground">{title}</h3>
      {description ? <p className="mt-1 max-w-sm text-sm text-pretty text-muted-foreground">{description}</p> : null}
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  )
}
