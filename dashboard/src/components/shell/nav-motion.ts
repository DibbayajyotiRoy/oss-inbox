"use client"

import * as React from "react"

const ACTIVE_ITEM = '[data-sidebar="menu-button"][aria-current="page"]'

/**
 * One shared highlight behind the active nav item. It glides (translate + height)
 * from the previous item on navigation and jumps without animating on first paint,
 * resize, collapse and sheet open. Writes styles straight to the DOM, so no
 * re-render per move. Its container is the indicator's parent (SidebarContent).
 */
export function useNavIndicator(pathname: string, layoutKey: string) {
  const indicatorRef = React.useRef<HTMLSpanElement>(null)
  const placeRef = React.useRef<((animate: boolean) => void) | null>(null)

  React.useLayoutEffect(() => {
    const indicator = indicatorRef.current
    const container = indicator?.parentElement
    if (!indicator || !container) return

    let placed = false
    const place = (animate: boolean) => {
      const active = container.querySelector<HTMLElement>(ACTIVE_ITEM)
      if (!active) {
        indicator.style.opacity = "0"
        return
      }
      const box = container.getBoundingClientRect()
      const rect = active.getBoundingClientRect()
      const x = rect.left - box.left + container.scrollLeft
      const y = rect.top - box.top + container.scrollTop
      const apply = () => {
        indicator.style.transform = `translate(${x}px, ${y}px)`
        indicator.style.width = `${rect.width}px`
        indicator.style.height = `${rect.height}px`
      }
      const visible = indicator.style.opacity === "1"
      if (animate && visible) {
        apply()
      } else {
        // Snap into place (no glide from a stale spot); only a re-show after a hidden state fades in.
        indicator.style.transition = "none"
        apply()
        if (!placed) indicator.style.opacity = "1"
        void indicator.offsetHeight
        indicator.style.transition = ""
      }
      indicator.style.opacity = "1"
      if (!placed) {
        placed = true
        // From here on the items drop their own active fill; the indicator draws it.
        container.dataset.navIndicator = "ready"
      }
    }
    placeRef.current = place
    place(false)

    // Collapsing animates widths and group-label margins, so watch the groups and items, not just the container.
    const resize = new ResizeObserver(() => place(false))
    resize.observe(container)
    container
      .querySelectorAll<HTMLElement>('[data-sidebar="group"], [data-sidebar="menu-button"]')
      .forEach((el) => resize.observe(el))
    return () => {
      resize.disconnect()
      placeRef.current = null
      delete container.dataset.navIndicator
    }
  }, [])

  React.useLayoutEffect(() => {
    placeRef.current?.(true)
  }, [pathname])

  React.useLayoutEffect(() => {
    placeRef.current?.(false)
  }, [layoutKey])

  return indicatorRef
}

const MENU_BUTTON = '[data-sidebar="menu-button"]'
const MENU = '[data-sidebar="menu"]'
// The pill's exit fade in globals.css: a re-show inside it glides on instead of jumping.
const HOVER_EXIT_MS = 180

/**
 * One shared hover fill that follows the pointer between nav items (after BeUI's Animated
 * Sidebar; motion in globals.css, `.nav-hover-pill`). It blurs in where the pointer enters a
 * menu, glides item to item, stays put over the gaps inside a menu, and blurs out on leaving
 * one. Mouse and pen only: touch keeps the items' own fills. Writes styles straight to the DOM,
 * so no re-render per move. Its container is the pill's parent (SidebarContent).
 */
export function useNavHover(layoutKey: string) {
  const pillRef = React.useRef<HTMLSpanElement>(null)
  const resetRef = React.useRef<(() => void) | null>(null)

  React.useLayoutEffect(() => {
    const pill = pillRef.current
    const container = pill?.parentElement
    if (!pill || !container || !window.matchMedia("(hover: hover) and (pointer: fine)").matches) return

    let current: HTMLElement | null = null
    let hiddenAt = -Infinity

    const moveTo = (el: HTMLElement) => {
      const box = container.getBoundingClientRect()
      const rect = el.getBoundingClientRect()
      const x = rect.left - box.left + container.scrollLeft
      const y = rect.top - box.top + container.scrollTop
      pill.style.transform = `translate(${x}px, ${y}px)`
      pill.style.width = `${rect.width}px`
      pill.style.height = `${rect.height}px`
    }
    // Applies a change without transitions (a jump), then hands them back to the CSS.
    const instantly = (change: () => void) => {
      pill.style.transition = "none"
      change()
      void pill.offsetHeight
      pill.style.transition = ""
    }
    const show = (el: HTMLElement) => {
      if (el === current) return
      // On screen, or still fading out: glide from there. Otherwise jump into place, then blur in.
      const onScreen = current !== null || performance.now() - hiddenAt < HOVER_EXIT_MS
      current = el
      if (onScreen) moveTo(el)
      else instantly(() => moveTo(el))
      pill.dataset.state = "shown"
    }
    const hide = () => {
      if (!current) return
      current = null
      hiddenAt = performance.now()
      pill.dataset.state = "hidden"
    }
    const onOver = (event: PointerEvent) => {
      if (event.pointerType === "touch") return
      const target = event.target as Element
      const button = target.closest<HTMLElement>(MENU_BUTTON)
      if (button && container.contains(button)) show(button)
      else if (!target.closest(MENU)) hide()
    }
    resetRef.current = () => {
      current = null
      hiddenAt = -Infinity
      instantly(() => {
        pill.dataset.state = "hidden"
      })
    }

    // From here on the items drop their own hover fill; the pill draws it.
    container.dataset.navHover = "ready"
    container.addEventListener("pointerover", onOver)
    container.addEventListener("pointerleave", hide)
    return () => {
      container.removeEventListener("pointerover", onOver)
      container.removeEventListener("pointerleave", hide)
      delete container.dataset.navHover
      resetRef.current = null
    }
  }, [])

  // Collapse, expand and the mobile sheet move every item: drop the pill rather than chase them.
  React.useLayoutEffect(() => {
    resetRef.current?.()
  }, [layoutKey])

  return pillRef
}
