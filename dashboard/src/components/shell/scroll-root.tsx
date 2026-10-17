"use client"

import * as React from "react"
import { usePathname } from "next/navigation"

import { cn } from "@/lib/utils"

/**
 * The dashboard's only page scroller. The shell frame (inset panel, header, sidebar) stays put and
 * this container scrolls, so the document itself never does. Other code can find it via
 * `[data-scroll-root]`; `scrollIntoView` works inside it as usual.
 *
 * Next resets window scroll on navigation, not inner containers, so reset it here when the pathname
 * changes (or bring a `#hash` target into view).
 */
export function ScrollRoot({ className, children, ...props }: React.ComponentProps<"div">) {
  const ref = React.useRef<HTMLDivElement>(null)
  const pathname = usePathname()

  React.useEffect(() => {
    const el = ref.current
    if (!el) return
    el.scrollTo({ top: 0, left: 0 })
    const hash = decodeURIComponent(window.location.hash.slice(1))
    if (!hash) return

    // The page may still be streaming (loading.tsx shows first): wait briefly for the target.
    const reveal = () => {
      const target = document.getElementById(hash)
      if (!target || !el.contains(target)) return false
      target.scrollIntoView({ block: "start" })
      return true
    }
    if (reveal()) return
    const observer = new MutationObserver(() => {
      if (reveal()) observer.disconnect()
    })
    observer.observe(el, { childList: true, subtree: true })
    const timeout = window.setTimeout(() => observer.disconnect(), 3000)
    return () => {
      observer.disconnect()
      window.clearTimeout(timeout)
    }
  }, [pathname])

  return (
    <div
      ref={ref}
      data-scroll-root=""
      className={cn(
        "min-h-0 min-w-0 flex-1 overflow-y-auto overscroll-contain outline-none [scrollbar-gutter:stable]",
        className
      )}
      {...props}
    >
      {children}
    </div>
  )
}
