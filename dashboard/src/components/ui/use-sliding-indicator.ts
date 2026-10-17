"use client"

import * as React from "react"

/**
 * Positions ONE shared indicator element behind the active item of a tab list or
 * segmented control, and lets CSS glide it there (translateX + width), the same
 * motion as the sidebar's active indicator. Writes styles straight to the DOM, so
 * there is no React re-render per move.
 *
 * - A selection change (the active item's `data-state` / `aria-selected` /
 *   `aria-current` flips) glides from the previous item to the new one.
 * - First paint, resize and web-font swaps snap into place without gliding.
 * - Under `prefers-reduced-motion` the `motion-safe:` classes drop the transition,
 *   so every move is instant.
 * - When the container scrolls sideways (narrow screens), the active item is kept
 *   in view.
 */
export function useSlidingIndicator(
  containerRef: React.RefObject<HTMLElement | null>,
  indicatorRef: React.RefObject<HTMLElement | null>,
  activeSelector: string,
) {
  React.useLayoutEffect(() => {
    const container = containerRef.current
    const indicator = indicatorRef.current
    if (!container || !indicator) return

    let placed = false
    const place = (animate: boolean) => {
      const active = container.querySelector<HTMLElement>(activeSelector)
      if (!active) {
        indicator.style.opacity = "0"
        return
      }
      const apply = () => {
        indicator.style.width = `${active.offsetWidth}px`
        indicator.style.transform = `translateX(${active.offsetLeft}px)`
      }
      if (animate && placed) {
        apply()
      } else {
        // Snap: no glide from a stale spot on mount, resize or font load.
        indicator.style.transition = "none"
        apply()
        void indicator.offsetWidth
        indicator.style.transition = ""
      }
      indicator.style.opacity = "1"
      // Scroll the active item into view on mount and on selection, not on every resize.
      if (animate || !placed) reveal(container, active, animate)
      if (!placed) {
        placed = true
        // From here on, items stop painting their own active fill; the indicator draws it.
        indicator.dataset.ready = "true"
      }
    }

    place(false)
    const mutations = new MutationObserver(() => place(true))
    mutations.observe(container, {
      subtree: true,
      attributes: true,
      attributeFilter: ["data-state", "aria-selected", "aria-current"],
    })
    // Observe every item, not just the list: when the web font swaps in, the
    // labels shrink while the full-width list keeps its size, and a list-only
    // observer would leave the indicator at the fallback font's wider width.
    const resize = new ResizeObserver(() => place(false))
    resize.observe(container)
    container
      .querySelectorAll<HTMLElement>('[role="tab"], [role="radio"], button, a')
      .forEach((el) => resize.observe(el))
    let alive = true
    document.fonts?.ready.then(() => alive && place(false)).catch(() => {})
    return () => {
      alive = false
      mutations.disconnect()
      resize.disconnect()
    }
  }, [containerRef, indicatorRef, activeSelector])
}

/** Scrolls a horizontally scrolling container just enough to show the active item (plus a 16px margin). */
function reveal(container: HTMLElement, active: HTMLElement, animate: boolean) {
  if (container.scrollWidth <= container.clientWidth) return
  const pad = 16
  const left = active.offsetLeft
  const right = left + active.offsetWidth
  let target = container.scrollLeft
  if (left - pad < container.scrollLeft) target = left - pad
  else if (right + pad > container.scrollLeft + container.clientWidth) target = right + pad - container.clientWidth
  target = Math.max(0, target)
  if (target === container.scrollLeft) return
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches
  container.scrollTo({ left: target, behavior: animate && !reduce ? "smooth" : "auto" })
}

/**
 * Classes for the indicator element. Hidden until first placed; the transition
 * matches the sidebar indicator (250ms, cubic-bezier(0.2, 0.8, 0.2, 1)) and only
 * runs when motion is OK.
 */
export const indicatorMotion =
  "pointer-events-none absolute left-0 opacity-0 motion-safe:transition-[transform,width,opacity] motion-safe:duration-250 motion-safe:ease-[cubic-bezier(0.2,0.8,0.2,1)]"

/**
 * The tab selected state, drawn by one element: a soft `muted` pill behind the
 * active tab's content, 5px above a 2px `foreground` underline that sits on the
 * track and overhangs the pill by 3px each side. Put the span first inside a
 * `tabPillList` whose items use `tabPillTrigger` (h-7).
 */
export const tabPillIndicator = [
  indicatorMotion,
  "inset-y-0",
  "before:absolute before:inset-x-0 before:top-0.5 before:bottom-[7px] before:rounded-md before:bg-muted",
  "after:absolute after:-inset-x-[3px] after:bottom-0 after:h-0.5 after:rounded-full after:bg-foreground",
].join(" ")

/**
 * Tab list layout for `tabPillIndicator`. The 1px track is an inset shadow, not a
 * border, so a scrolling list doesn't clip the underline that overlaps it. The
 * padding leaves room for the underline's 3px overhang and the focus ring.
 */
export const tabPillTrack = "shadow-[inset_0_-1px_0_var(--border)]"
export const tabPillList = `relative isolate flex items-center gap-1 px-[3px] pt-0.5 pb-[7px] ${tabPillTrack}`

/** Tab trigger box plus the 150ms label colour crossfade (the caller adds active/inactive colours). */
export const tabPillTrigger =
  "relative inline-flex h-7 shrink-0 items-center gap-2 rounded-md px-2.5 text-sm font-medium whitespace-nowrap outline-none transition-[color] duration-150 focus-visible:ring-2 focus-visible:ring-ring [&_svg]:size-4 [&_svg]:shrink-0"
