import { cookies } from "next/headers"
import { Shell } from "@/components/shell/app-shell"
import { Seed } from "@/lib/seed"
import { preload } from "@/lib/server-api"
import type { Me, Overview } from "@/lib/types"

export default async function AppLayout({ children }: LayoutProps<"/">) {
  // The sidebar writes this cookie when toggled, so the first paint already has the right width.
  const defaultOpen = (await cookies()).get("sidebar_state")?.value !== "false"
  // The frame needs who you are and (with one org) its repositories: ship both in the HTML instead of two fetches after hydration.
  const me = await preload<Me>("/api/me")
  const solo = me?.orgs.length === 1 ? me.orgs[0].id : undefined
  const overview = solo === undefined ? undefined : await preload<Overview>(`/api/orgs/${solo}/overview`)
  return (
    <Seed data={{ "/api/me": me, [`/api/orgs/${solo}/overview`]: overview }}>
      <Shell defaultOpen={defaultOpen}>{children}</Shell>
    </Seed>
  )
}
