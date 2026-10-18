"use client"
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react"

type Get = (path: string) => unknown
const Ctx = createContext<Get>(() => undefined)

const HYDRATE_MS = 20_000

/**
 * First-paint API data fetched on the server (`preload`), keyed by path. `useApi` starts from it, but only
 * in the render that shipped with it (SSR + hydration); anything mounted later fetches fresh data. A payload
 * the router cache replays later (Back) is older than the HTML that shipped it: `performance.now()` counts
 * from the document load, so past `HYDRATE_MS` the seed is not trusted.
 * Nest freely: a path is looked up here, then in the enclosing `Seed`.
 */
export function Seed({ data, children }: { data: Record<string, unknown>; children: ReactNode }) {
  const parent = useContext(Ctx)
  const open = useRef(true) // true until the first commit: later mounts fetch fresh
  useEffect(() => {
    open.current = false
  }, [])
  const [get] = useState<Get>(() => {
    const trusted = typeof window === "undefined" || performance.now() < HYDRATE_MS
    return (path: string) => (trusted && open.current && data[path] !== undefined ? data[path] : parent(path))
  })
  return <Ctx value={get}>{children}</Ctx>
}

export const useSeeded = () => useContext(Ctx)
