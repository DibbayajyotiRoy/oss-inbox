"use client"

import { useEffect, useRef } from "react"
import { useRegisteredCommands } from "./commands"

/**
 * Global keys: ⌘/Ctrl+K opens the palette; every registered command with `run` and a plain-key or
 * sequence `keys` ("?", "g q") fires on it, except while typing or with an overlay open. Bare keys are
 * handled after the event finishes, so a screen that handles a key itself and calls preventDefault wins.
 */
export function useHotkeys(onPalette: () => void) {
  const commands = useRegisteredCommands()
  const bound = useRef(commands)
  const palette = useRef(onPalette)
  useEffect(() => {
    bound.current = commands
    palette.current = onPalette
  })

  useEffect(() => {
    let seq = ""
    let timer: number | undefined
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault()
        palette.current()
        return
      }
      const t = e.target as HTMLElement | null
      if (e.metaKey || e.ctrlKey || e.altKey || e.key.length !== 1) return
      if (t?.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t?.tagName ?? "")) return
      setTimeout(() => {
        if (e.defaultPrevented || document.querySelector('[role="dialog"],[role="menu"]')) return
        const binds = bound.current.filter((c) => c.run && c.keys && !c.keys.includes("+"))
        const next = seq ? `${seq} ${e.key.toLowerCase()}` : e.key.toLowerCase()
        const hit = binds.find((c) => c.keys === next)
        clearTimeout(timer)
        if (hit) {
          seq = ""
          hit.run?.()
        } else if (binds.some((c) => c.keys?.startsWith(`${next} `))) {
          seq = next
          timer = window.setTimeout(() => (seq = ""), 1000)
        } else seq = ""
      })
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [])
}
