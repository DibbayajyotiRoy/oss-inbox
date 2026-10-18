import { Preloaded, preload } from "@/lib/server-api"
import type { Overview } from "@/lib/types"

/** Ship the overview, each enabled repo's detail (feature modes, n) and the install link in the HTML: the page has no first-paint fetches left. */
export default async function Layout({ params, children }: LayoutProps<"/orgs/[orgId]">) {
  const overview = `/api/orgs/${(await params).orgId}/overview`
  const repos = (await preload<Overview>(overview))?.repos.filter((r) => r.enabled) ?? []
  return <Preloaded paths={[overview, "/api/setup/status", ...repos.map((r) => `/api/repos/${r.id}`)]}>{children}</Preloaded>
}
