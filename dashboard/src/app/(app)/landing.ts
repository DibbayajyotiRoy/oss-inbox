import { cookies } from "next/headers"
import { redirect } from "next/navigation"
import { repoPath } from "@/lib/fmt"
import type { Me, Overview } from "@/lib/types"

/** Cookie the shell writes whenever a repo is opened (see `rememberRepo` in the app shell). */
export const LAST_REPO = "jev_repo"

async function get<T>(path: string): Promise<T | undefined> {
  const res = await fetch(`${process.env.API_URL ?? "http://localhost:8000"}${path}`, {
    headers: { cookie: (await cookies()).toString() },
    cache: "no-store",
  }).catch(() => null)
  if (res?.status === 401) redirect("/login")
  return res?.ok ? ((await res.json()) as T) : undefined
}

/**
 * Open a repo instead of a list: the one opened last, else the enabled repo with the most items waiting for review
 * (ties and zero: the first). Nothing enabled yet: set up the first repo. Redirects, or returns when there is no repo at all.
 * Not `preload`: that skips client navigations, and a redirect has to happen on those too.
 * `orgIds` omitted: every org of the visitor.
 */
export async function openARepo(orgIds?: number[]) {
  const ids = orgIds ?? (await get<Me>("/api/me"))?.orgs.map((o) => o.id) ?? []
  const repos = (await Promise.all(ids.map((id) => get<Overview>(`/api/orgs/${id}/overview`)))).flatMap((o) => o?.repos ?? [])
  const on = repos.filter((r) => r.enabled)
  const last = Number((await cookies()).get(LAST_REPO)?.value)
  const busiest = on.reduce((best, r) => (r.queued_open > best.queued_open ? r : best), on[0])
  const pick = on.find((r) => r.id === last) ?? busiest
  if (pick) redirect(repoPath(pick.id))
  if (repos[0]) redirect(`/onboarding/${repos[0].id}`)
}
