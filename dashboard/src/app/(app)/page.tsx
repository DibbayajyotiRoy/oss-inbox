import { redirect } from "next/navigation"
import { Preloaded, preload } from "@/lib/server-api"
import type { Me, Overview } from "@/lib/types"
import { Home } from "./home"

/** One org with a repository switched on goes straight to its repositories (no client round trip); everything else renders `Home`, with the data it lists already in the HTML. */
export default async function Page() {
  const me = await preload<Me>("/api/me")
  const solo = me?.orgs.length === 1 ? me.orgs[0].id : undefined
  const overview = solo === undefined ? undefined : await preload<Overview>(`/api/orgs/${solo}/overview`)
  if (overview?.repos.some((r) => r.enabled)) redirect(`/orgs/${solo}`)
  const paths = me?.orgs.length ? me.orgs.map((o) => `/api/orgs/${o.id}/overview`) : ["/api/setup/status"]
  return (
    <Preloaded paths={paths}>
      <Home />
    </Preloaded>
  )
}
