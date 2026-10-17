"use client"

import * as React from "react"

import { cn } from "@/lib/utils"
import { indicatorMotion, tabPillIndicator, tabPillList, tabPillTrigger, useSlidingIndicator } from "./use-sliding-indicator"

export interface TabItem {
  id: string
  label: React.ReactNode
  icon?: React.ReactNode
}

export interface TabsProps {
  items: TabItem[]
  value: string
  onValueChange: (id: string) => void
  /** `line` (default): muted pill + 2px underline. `segmented`: bordered control with a sliding fill. */
  variant?: "line" | "segmented"
  className?: string
  "aria-label"?: string
}

/**
 * Controlled tab strip: you render the panel for `value`. One shared indicator glides between tabs
 * (250ms, DESIGN.md easing); arrows/Home/End move focus and selection.
 */
function Tabs({ items, value, onValueChange, variant = "line", className, ...rest }: TabsProps) {
  const listRef = React.useRef<HTMLDivElement>(null)
  const indicatorRef = React.useRef<HTMLSpanElement>(null)
  const tabRefs = React.useRef<(HTMLButtonElement | null)[]>([])
  const segmented = variant === "segmented"
  useSlidingIndicator(listRef, indicatorRef, '[role="tab"][aria-selected="true"]')

  function onKeyDown(e: React.KeyboardEvent, index: number) {
    const last = items.length - 1
    const next = { ArrowRight: index === last ? 0 : index + 1, ArrowLeft: index === 0 ? last : index - 1, Home: 0, End: last }[e.key]
    if (next === undefined) return
    e.preventDefault()
    tabRefs.current[next]?.focus()
    onValueChange(items[next].id)
  }

  return (
    <div
      ref={listRef}
      role="tablist"
      aria-orientation="horizontal"
      aria-label={rest["aria-label"]}
      className={cn(
        segmented
          ? "relative isolate inline-flex w-fit items-center gap-0.5 rounded-lg border bg-card p-0.5"
          : cn(tabPillList, "overflow-x-auto overscroll-x-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"),
        className
      )}
    >
      {/* One shared indicator, first in the DOM so the (positioned) tabs paint over it. */}
      <span ref={indicatorRef} aria-hidden className={segmented ? cn(indicatorMotion, "inset-y-0.5 rounded-md bg-accent") : tabPillIndicator} />
      {items.map((item, i) => {
        const active = item.id === value
        return (
          <button
            key={item.id}
            ref={(el) => {
              tabRefs.current[i] = el
            }}
            type="button"
            role="tab"
            aria-selected={active}
            tabIndex={active ? 0 : -1}
            onClick={() => onValueChange(item.id)}
            onKeyDown={(e) => onKeyDown(e, i)}
            className={cn(tabPillTrigger, segmented && "px-3", active ? "text-foreground" : "text-muted-foreground hover:text-foreground")}
          >
            {item.icon}
            {item.label}
          </button>
        )
      })}
    </div>
  )
}

export { Tabs }
