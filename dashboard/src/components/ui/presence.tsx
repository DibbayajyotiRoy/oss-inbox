"use client"

/*
 * Small text-presence motion (docs/DESIGN.md §8), built on the Web Animations
 * API; no animation library.
 *
 * - <FadePresence>: text that appears or disappears (hints, errors, notes).
 * - <SwapText>: a short, single-line label that changes ("Copy" → "Copied").
 *
 * Both are interruptible: a new change starts from wherever the running
 * animation had got to. Under prefers-reduced-motion everything is instant.
 */

import * as React from "react"

import { cn } from "@/lib/utils"

const REDUCED = "(prefers-reduced-motion: reduce)"
const EASE_OUT = "cubic-bezier(0.2, 0.8, 0.2, 1)"
const EASE_IN = "cubic-bezier(0.4, 0, 1, 1)"
const ENTER_MS = 160
const EXIT_MS = 120

function subscribeReduced(cb: () => void) {
  const mq = window.matchMedia(REDUCED)
  mq.addEventListener("change", cb)
  return () => mq.removeEventListener("change", cb)
}

/** True when the user asks for reduced motion (false on the server). */
export function useReducedMotion() {
  return React.useSyncExternalStore(
    subscribeReduced,
    () => window.matchMedia(REDUCED).matches,
    () => false,
  )
}

/** Cancel an element's running animations, returning the opacity and height it had reached. */
function settle(el: HTMLElement) {
  const opacity = getComputedStyle(el).opacity
  const height = el.getBoundingClientRect().height
  el.getAnimations().forEach((a) => a.cancel())
  return { opacity, height }
}

// ---------------------------------------------------------------------------
// FadePresence
// ---------------------------------------------------------------------------

export type PresenceMode = "fade" | "fade-slide" | "fade-scale" | "collapse"

export interface FadePresenceProps {
  show: boolean
  children: React.ReactNode
  /** Wrapper element: `span` for inline text, `div` (default) for blocks. */
  as?: "span" | "div"
  /**
   * `fade`: opacity only. `fade-slide` (default): opacity plus a 3px rise.
   * `fade-scale`: opacity plus a 0.9 → 1 scale (small badges and pills).
   * `collapse`: also animates height to and from 0, so the content below
   * slides instead of jumping (block-level helper and error text).
   */
  mode?: PresenceMode
  /** Animate the first mount too. Off by default: content present at load just renders. */
  initial?: boolean
  className?: string
}

/**
 * Mounts `children` with a short fade (160ms ease-out) when `show` turns true,
 * and plays the reverse (120ms ease-in) before unmounting when it turns false.
 * While leaving, the content keeps its last children, is `inert` and
 * `aria-hidden`, so it is neither read nor focusable.
 */
export function FadePresence({ show, children, as = "div", mode = "fade-slide", initial = false, className }: FadePresenceProps) {
  const reduced = useReducedMotion()
  const ref = React.useRef<HTMLElement>(null)
  const [present, setPresent] = React.useState(show)
  const [held, setHeld] = React.useState<React.ReactNode>(show ? children : null)
  // The `show` the last animation ran for; starts equal so a first mount doesn't animate.
  const last = React.useRef(initial ? !show : show)

  // Derived state (React's "adjust state while rendering" pattern): mount on
  // show, and keep the last shown children for the exit animation.
  if (show && !present) setPresent(true)
  if (show && held !== children) setHeld(children)

  const mounted = present && (show || !reduced)

  React.useLayoutEffect(() => {
    if (last.current === show) return
    last.current = show
    const el = ref.current
    if (!el || reduced) return
    const from = settle(el)
    const collapse = mode === "collapse"
    const rise = mode === "fade" ? "none" : mode === "fade-scale" ? "scale(0.9)" : "translateY(3px)"
    if (show) {
      const start = from.opacity === "1" ? "0" : from.opacity
      const frames: Keyframe[] = [
        { opacity: start, transform: rise },
        { opacity: 1, transform: "none" },
      ]
      if (collapse) {
        frames[0].height = `${from.opacity === "1" ? 0 : from.height}px`
        frames[1].height = `${el.scrollHeight}px`
      }
      const anim = el.animate(frames, { duration: ENTER_MS, easing: EASE_OUT })
      // Clip only while the height moves, so focus rings inside aren't cut off at rest.
      if (collapse) {
        el.style.overflow = "hidden"
        anim.onfinish = () => (el.style.overflow = "")
      }
    } else {
      const frames: Keyframe[] = [
        { opacity: from.opacity, transform: "none" },
        { opacity: 0, transform: rise },
      ]
      if (collapse) {
        frames[0].height = `${from.height}px`
        frames[1].height = "0px"
      }
      if (collapse) el.style.overflow = "hidden"
      const anim = el.animate(frames, { duration: EXIT_MS, easing: EASE_IN, fill: "forwards" })
      // A cancelled animation (show flipped back) never fires onfinish.
      anim.onfinish = () => setPresent(false)
    }
  }, [show, reduced, mode, initial])

  if (!mounted) return null
  const Tag = as
  return (
    <Tag
      ref={ref as React.Ref<HTMLDivElement & HTMLSpanElement>}
      aria-hidden={show ? undefined : true}
      inert={!show}
      className={cn(as === "span" && mode !== "fade" && "inline-block", mode === "fade-scale" && "origin-center", className)}
    >
      {show ? children : held}
    </Tag>
  )
}

// ---------------------------------------------------------------------------
// SwapText
// ---------------------------------------------------------------------------

interface SwapItem {
  key: string
  node: React.ReactNode
}

export interface SwapTextProps {
  /** The text to show. A string is its own identity; pass `swapKey` for a node. */
  value: React.ReactNode
  /** Identity of `value`; a change triggers the swap. Defaults to `String(value)`. */
  swapKey?: string
  /**
   * Slot-roll instead of the 3px crossfade: the old text leaves a full line in
   * this direction and the new one follows from the other side (180ms, clipped
   * to the line). `up` for a count that grew, `down` for one that shrank.
   */
  roll?: "up" | "down"
  className?: string
}

const ROLL_MS = 180

function Leaving({ node, roll, onDone }: { node: React.ReactNode; roll?: "up" | "down"; onDone: () => void }) {
  const ref = React.useRef<HTMLSpanElement>(null)
  const done = React.useRef(onDone)
  React.useLayoutEffect(() => {
    done.current = onDone
  })
  React.useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const anim = el.animate(
      [
        { opacity: 1, transform: "none" },
        { opacity: 0, transform: roll ? `translateY(${roll === "up" ? "-100%" : "100%"})` : "translateY(-3px)" },
      ],
      roll
        ? { duration: ROLL_MS, easing: EASE_OUT, fill: "forwards" }
        : { duration: EXIT_MS, easing: EASE_IN, fill: "forwards" },
    )
    anim.onfinish = () => done.current()
    return () => anim.cancel()
    // The direction is fixed when the text starts leaving.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  return (
    <span ref={ref} data-swap-leaving="" aria-hidden inert className="pointer-events-none absolute top-0 left-0 whitespace-nowrap">
      {node}
    </span>
  )
}

/**
 * A short, single-line label that crossfades when it changes: the old text
 * lifts out while the new one rises in, and the width eases between the two
 * so neighbours glide instead of jumping. Only the current text is exposed to
 * assistive tech.
 */
export function SwapText({ value, swapKey, roll, className }: SwapTextProps) {
  const key = swapKey ?? String(value)
  const reduced = useReducedMotion()
  const box = React.useRef<HTMLSpanElement>(null)
  const current = React.useRef<HTMLSpanElement>(null)
  const [prev, setPrev] = React.useState<SwapItem>({ key, node: value })
  const [leaving, setLeaving] = React.useState<SwapItem[]>([])

  if (prev.key !== key) {
    setPrev({ key, node: value })
    if (!reduced) setLeaving((l) => [...l.filter((i) => i.key !== key), prev].slice(-2))
  }
  const seen = React.useRef(key)

  React.useLayoutEffect(() => {
    const el = box.current
    const cur = current.current
    if (seen.current === key) return
    seen.current = key
    if (!el || !cur || reduced) return
    // Width: from what is on screen now (a running glide, or the outgoing text) to the new text.
    const gliding = el.getAnimations().length > 0
    const outgoing = el.querySelector<HTMLElement>("[data-swap-leaving]:last-of-type")
    const from = gliding ? el.getBoundingClientRect().width : (outgoing?.offsetWidth ?? cur.offsetWidth)
    el.getAnimations().forEach((a) => a.cancel())
    const to = cur.offsetWidth
    if (Math.abs(from - to) > 0.5) {
      el.animate([{ width: `${from}px` }, { width: `${to}px` }], { duration: 200, easing: EASE_OUT })
    }
    cur.animate(
      [
        { opacity: 0, transform: roll ? `translateY(${roll === "up" ? "100%" : "-100%"})` : "translateY(3px)" },
        { opacity: 1, transform: "none" },
      ],
      { duration: roll ? ROLL_MS : ENTER_MS, easing: EASE_OUT },
    )
  }, [key, reduced, roll])

  return (
    <span ref={box} className={cn("relative inline-block whitespace-nowrap align-bottom", roll && "overflow-clip", className)}>
      <span ref={current} className="inline-block">
        {value}
      </span>
      {reduced
        ? null
        : leaving.map((item) => (
            <Leaving key={item.key} node={item.node} roll={roll} onDone={() => setLeaving((l) => l.filter((i) => i !== item))} />
          ))}
    </span>
  )
}
