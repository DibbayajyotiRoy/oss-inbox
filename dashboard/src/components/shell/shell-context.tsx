"use client"

import { createContext, useContext } from "react"
import type { Me, Overview } from "@/lib/types"

export interface ShellState {
  me: Me
  /** Org in view: from the URL, else the repo's owner, else the only org. */
  orgId: number | null
  /** Repo in view: from the URL, else the last one visited (item pages have none in their URL). */
  repoId: number | null
  /** The org's repo cards: names, open queue/held counts. Undefined while loading or without an org. */
  overview?: Overview
  /** Refetch overview (the Queue/Held badges). Call after resolving items. */
  reloadOverview: () => void
}

export const ShellContext = createContext<ShellState | null>(null)

/** Signed-in user, org/repo in view and the nav counts. Only inside the shell. */
export function useShell() {
  const s = useContext(ShellContext)
  if (!s) throw new Error("useShell outside Shell")
  return s
}

export const useMe = () => useShell().me
