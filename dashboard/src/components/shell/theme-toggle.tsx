"use client"

import * as React from "react"
import { Moon, Sun } from "lucide-react"
import { useTheme } from "next-themes"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

const subscribe = () => () => {}

/**
 * Light/dark toggle that repaints through a root view transition: the new theme wipes across the old one
 * (up into dark, down into light; globals.css `html[data-theme-wipe]`). Falls back to an instant switch
 * without view transitions or under reduced motion.
 */
export function useThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme()
  const mounted = React.useSyncExternalStore(subscribe, () => true, () => false)
  const isDark = mounted && resolvedTheme === "dark"

  function toggle() {
    const next = isDark ? "light" : "dark"
    if (matchMedia("(prefers-reduced-motion: reduce)").matches || typeof document.startViewTransition !== "function") {
      setTheme(next)
      return
    }
    const root = document.documentElement
    root.dataset.themeWipe = next === "dark" ? "up" : "down"
    // next-themes sets the class in an effect after setTheme returns; the transition snapshots when this resolves.
    document
      .startViewTransition(async () => {
        setTheme(next)
        await classApplied(root, next)
      })
      .finished.finally(() => delete root.dataset.themeWipe)
  }

  return { mounted, isDark, toggle }
}

/** Resolves once `theme` is on <html>'s class list, or after 300ms so the page never stays frozen. */
function classApplied(root: HTMLElement, theme: string) {
  if (root.classList.contains(theme)) return Promise.resolve()
  return new Promise<void>((resolve) => {
    const done = () => {
      observer.disconnect()
      clearTimeout(timer)
      resolve()
    }
    const observer = new MutationObserver(() => root.classList.contains(theme) && done())
    observer.observe(root, { attributes: true, attributeFilter: ["class"] })
    const timer = setTimeout(done, 300)
  })
}

const swap = "absolute inset-0 flex items-center justify-center motion-safe:transition-[opacity,transform] motion-safe:duration-150 motion-safe:ease-settle"

export function ThemeToggle({ className }: { className?: string }) {
  const { mounted, isDark, toggle } = useThemeToggle()
  const label = mounted ? (isDark ? "Switch to light theme" : "Switch to dark theme") : "Switch theme"
  return (
    <Button variant="outline" size="icon-sm" aria-label={label} title={mounted ? label : undefined} onClick={toggle} className={cn("relative", className)}>
      {mounted ? (
        <>
          <span aria-hidden className={cn(swap, isDark ? "scale-100 opacity-100" : "scale-75 opacity-0")}>
            <Sun className="size-4" />
          </span>
          <span aria-hidden className={cn(swap, isDark ? "scale-75 opacity-0" : "scale-100 opacity-100")}>
            <Moon className="size-4" />
          </span>
        </>
      ) : null}
    </Button>
  )
}
