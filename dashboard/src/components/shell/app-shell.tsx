"use client"

import { useEffect, useState, useSyncExternalStore, type ReactNode } from "react"
import { useParams } from "next/navigation"

import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"
import { Spinner } from "@/components/ui/spinner"
import { ErrorState } from "@/components/ui/load"
import type { Me, Overview, Repo } from "@/lib/types"
import { useApi } from "@/lib/use-api"
import { AppSidebar } from "./app-sidebar"
import { CommandPalette } from "./command-palette"
import { useHotkeys } from "./hotkeys"
import { ScrollRoot } from "./scroll-root"
import { ShellContext, type ShellState } from "./shell-context"
import { useShellCommands } from "./shell-commands"
import { ShortcutsDialog } from "./shortcuts-dialog"
import { SiteHeader } from "./site-header"

const LAST_REPO = "jev:repo"
const listeners = new Set<() => void>()
const lastRepo = () => {
  try {
    return Number(localStorage.getItem(LAST_REPO)) || null
  } catch {
    return null
  }
}
const rememberRepo = (id: number) => {
  try {
    localStorage.setItem(LAST_REPO, String(id))
    listeners.forEach((l) => l())
  } catch {}
}

/**
 * Fixed frame: the viewport never scrolls. The inset panel keeps its border, radius and header in place;
 * only `ScrollRoot` (the page content) scrolls. Signs the user in via /api/me, then renders the frame.
 * `defaultOpen` is the sidebar cookie, read on the server by the (app) layout.
 */
export function Shell({ defaultOpen = true, children }: { defaultOpen?: boolean; children: ReactNode }) {
  const me = useApi<Me>("/api/me")
  if (me.error) return <div className="mx-auto max-w-lg p-6"><ErrorState error={me.error} retry={me.reload} /></div>
  if (!me.data) return <div className="grid min-h-dvh place-items-center text-muted-foreground"><Spinner className="size-5" /></div>
  return (
    <Frame me={me.data} defaultOpen={defaultOpen}>
      {children}
    </Frame>
  )
}

function Frame({ me, defaultOpen, children }: { me: Me; defaultOpen: boolean; children: ReactNode }) {
  const params = useParams<{ orgId?: string; repoId?: string }>()
  const last = useSyncExternalStore(
    (cb) => {
      listeners.add(cb)
      return () => listeners.delete(cb)
    },
    lastRepo,
    () => null,
  )
  const urlRepo = Number(params.repoId) || null
  const repoId = urlRepo ?? last
  useEffect(() => {
    if (urlRepo !== null) rememberRepo(urlRepo)
  }, [urlRepo])

  // Org: URL, else the only org, else the owner of the repo in view (one extra request, multi-org users only).
  const urlOrg = Number(params.orgId) || null
  const solo = me.orgs.length === 1 ? me.orgs[0].id : null
  const repo = useApi<Repo>(urlOrg === null && solo === null && repoId !== null ? `/api/repos/${repoId}` : null)
  const fullName = repo.data?.full_name
  const owner = fullName ? me.orgs.find((o) => fullName.startsWith(`${o.login}/`))?.id : undefined
  const orgId = urlOrg ?? solo ?? owner ?? null
  const overview = useApi<Overview>(orgId !== null ? `/api/orgs/${orgId}/overview` : null)

  const state: ShellState = { me, orgId, repoId, overview: overview.data, reloadOverview: overview.reload }
  const [palette, setPalette] = useState(false)
  const [help, setHelp] = useState(false)

  return (
    <ShellContext value={state}>
      <Interactions palette={palette} setPalette={setPalette} help={help} setHelp={setHelp} />
      <SidebarProvider defaultOpen={defaultOpen} className="isolate h-svh overflow-clip">
        <a
          href="#content"
          className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:rounded-md focus:bg-primary focus:px-3 focus:py-2 focus:text-sm focus:text-primary-foreground"
        >
          Skip to content
        </a>
        <AppSidebar onShortcuts={() => setHelp(true)} />
        <SidebarInset className="min-h-0 overflow-clip">
          <SiteHeader onSearch={() => setPalette(true)} />
          <ScrollRoot id="content" tabIndex={-1}>
            <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 lg:px-10">{children}</div>
          </ScrollRoot>
        </SidebarInset>
      </SidebarProvider>
    </ShellContext>
  )
}

/** Palette, shortcuts dialog and the keys that open them. Inside the context, outside the sidebar. */
function Interactions({ palette, setPalette, help, setHelp }: { palette: boolean; setPalette: (o: boolean) => void; help: boolean; setHelp: (o: boolean) => void }) {
  useShellCommands({ onShortcuts: () => setHelp(true) })
  useHotkeys(() => setPalette(!palette))
  return (
    <>
      <CommandPalette open={palette} onOpenChange={setPalette} />
      <ShortcutsDialog open={help} onOpenChange={setHelp} />
    </>
  )
}
