"use client"

import { useEffect, useRef, useSyncExternalStore } from "react"
import type { LucideIcon } from "lucide-react"

/**
 * One registry for the ⌘K palette, the `?` shortcuts dialog and global key bindings.
 *
 *   useCommands([{ id: "backfill", label: "Run backfill", group: "Repository", run: start }])
 *   useCommands([{ id: "next", label: "Next item", keys: "j" }])   // no run: documents a key the screen handles itself
 *
 * Commands live while the calling component is mounted. Pass a fresh array every render: only ids, labels
 * and keys are compared, and `run` is always the latest closure.
 */
export interface Command {
  id: string
  label: string
  /** Palette section; shortcuts dialog heading. Default "Commands". */
  group?: string
  icon?: LucideIcon
  /** Extra palette search terms. */
  keywords?: string
  /** Key or sequence: "j", "g q", "?", "mod+b" (mod = ⌘ or Ctrl). Plain keys and sequences with a `run` are bound globally (not while typing). */
  keys?: string
  /** Omit for a shortcut the screen handles itself: it is then listed in `?` only, not in the palette. */
  run?: () => void
}

let groups = new Map<symbol, Command[]>()
let snapshot: Command[] = []
const listeners = new Set<() => void>()
const EMPTY: Command[] = []

function register(key: symbol, list: Command[]) {
  groups = new Map(groups).set(key, list)
  publish()
  return () => {
    groups = new Map(groups)
    groups.delete(key)
    publish()
  }
}

function publish() {
  snapshot = [...groups.values()].flat()
  listeners.forEach((l) => l())
}

export function useCommands(list: Command[]) {
  const latest = useRef(list)
  useEffect(() => {
    latest.current = list
  })
  const signature = list.map((c) => [c.id, c.label, c.group, c.keys, c.keywords, !!c.run].join("\0")).join("\n")
  useEffect(() => {
    // Handlers read the ref, so a re-render never re-registers; only a changed signature does.
    const wrapped = latest.current.map((c, i) => ({ ...c, run: c.run && (() => latest.current[i]?.run?.()) }))
    return register(Symbol(), wrapped)
  }, [signature])
}

/** All registered commands (server render: none). */
export function useRegisteredCommands() {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb)
      return () => listeners.delete(cb)
    },
    () => snapshot,
    () => EMPTY,
  )
}

const FIRST = ["General", "Go to", "Repositories"]

/** Sort key for group headings: General, Go to, Repositories, then screens' groups, then Preferences. */
export const groupRank = (group: string) => (FIRST.includes(group) ? FIRST.indexOf(group) - 99 : group === "Preferences" ? 99 : 0)

const noop = () => () => {}

/** "⌘" on Apple platforms, "Ctrl" elsewhere (what `mod` in a `keys` string means). */
export function useMod() {
  return useSyncExternalStore(noop, () => (/Mac|iPhone|iPad/.test(navigator.platform) ? "⌘" : "Ctrl"), () => "⌘")
}

/** Display keys for a `keys` string: "g q" -> ["G", "Q"], "mod+b" -> ["⌘", "B"]. */
export const keyCaps = (keys: string, mod: string) =>
  keys.split(/[ +]/).map((k) => (k === "mod" ? mod : k.length === 1 ? k.toUpperCase() : k))
