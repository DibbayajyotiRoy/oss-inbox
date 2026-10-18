import { cache, type ReactNode } from "react"
import { cookies, headers } from "next/headers"
import { redirect } from "next/navigation"
import { Seed } from "./seed"

/**
 * GET the Jev API on the server with the visitor's session, so first-paint data ships in the HTML instead of
 * waiting for hydration plus a fetch. Same path in one request = one call. Unreachable or failing gives
 * undefined (the client then fetches and shows the real error); a 401 sends the visitor to /login.
 * Only document requests preload: client navigations (RSC requests) skip it, so they keep their instant
 * skeletons and Back never restores stale data from the router cache.
 */
export const preload = cache(async <T,>(path: string): Promise<T | undefined> => {
  if ((await headers()).has("rsc")) return undefined
  const res = await fetch(`${process.env.API_URL ?? "http://localhost:8000"}${path}`, {
    headers: { cookie: (await cookies()).toString() },
    cache: "no-store",
  }).catch(() => null)
  if (res?.status === 401) redirect("/login")
  return res?.ok ? ((await res.json()) as T) : undefined
})

/** Wrap a layout or page: `useApi` calls for these paths start with the data already in the HTML (see `Seed`). */
export async function Preloaded({ paths, children }: { paths: string[]; children: ReactNode }) {
  const data = Object.fromEntries(await Promise.all(paths.map(async (p) => [p, await preload(p)] as const)))
  return <Seed data={data}>{children}</Seed>
}
