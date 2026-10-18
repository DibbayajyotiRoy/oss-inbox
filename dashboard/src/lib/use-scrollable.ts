"use client"
import { useEffect, useState } from "react"

const scrolls = (overflow: string) => overflow === "auto" || overflow === "scroll"

/**
 * Spread onto a scroll container. While it really overflows it joins the tab order as a labelled region, so the
 * keyboard can scroll it (axe `scrollable-region-focusable`); when everything fits it adds no tab stop.
 */
export function useScrollable<T extends HTMLElement>(label: string) {
  const [el, ref] = useState<T | null>(null)
  const [on, setOn] = useState(false)
  useEffect(() => {
    if (!el) return
    const check = () => {
      const cs = getComputedStyle(el)
      setOn((scrolls(cs.overflowX) && el.scrollWidth > el.clientWidth) || (scrolls(cs.overflowY) && el.scrollHeight > el.clientHeight))
    }
    const ro = new ResizeObserver(check) // fires once on observe, then on every resize of the box or its content
    ro.observe(el)
    for (const child of el.children) ro.observe(child)
    return () => ro.disconnect()
  }, [el])
  return { ref, ...(on && { tabIndex: 0, role: "region", "aria-label": label }) }
}
