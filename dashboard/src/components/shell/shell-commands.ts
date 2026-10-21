"use client"

import { useRouter } from "next/navigation"
import { Bot, FolderGit2, Keyboard, LayoutGrid, LogOut, SunMoon } from "lucide-react"

import { repoPath } from "@/lib/fmt"
import { useCommands } from "./commands"
import { NAV_ITEMS } from "./nav"
import { useShell } from "./shell-context"
import { useThemeToggle } from "./theme-toggle"
import { useSignOut } from "./user-menu"

/** The shell's own commands: go to any page of the repo in view, switch repo, theme, sign out, and the keys it handles itself. */
export function useShellCommands({ onShortcuts }: { onShortcuts: () => void }) {
  const router = useRouter()
  const { orgId, repoId, overview } = useShell()
  const { toggle } = useThemeToggle()
  const signOut = useSignOut()

  useCommands([
    ...(orgId !== null
      ? [{ id: "go:org", label: "Go to all repositories", group: "Go to", icon: LayoutGrid, keys: "g o", run: () => router.push(`/orgs/${orgId}`) }]
      : []),
    ...(repoId !== null
      ? [
          ...NAV_ITEMS.map((i) => ({ id: `go:${i.seg}`, label: `Go to ${i.label}`, group: "Go to", icon: i.icon, keys: i.keys, run: () => router.push(repoPath(repoId, i.seg)) })),
          { id: "go:agents", label: "Connect an agent (MCP)", group: "Go to", icon: Bot, keywords: "mcp claude cursor vscode token ai", run: () => router.push(`${repoPath(repoId, "settings")}?s=agents`) },
        ]
      : []),
    ...(overview?.repos ?? [])
      .filter((r) => r.id !== repoId)
      .map((r) => ({ id: `repo:${r.id}`, label: r.full_name, group: "Repositories", icon: FolderGit2, run: () => router.push(repoPath(r.id)) })),
    { id: "theme", label: "Toggle theme", group: "Preferences", icon: SunMoon, run: toggle },
    { id: "shortcuts", label: "Keyboard shortcuts", group: "Preferences", icon: Keyboard, keys: "?", run: onShortcuts },
    { id: "signout", label: "Sign out", group: "Preferences", icon: LogOut, run: signOut },
    // Handled by the palette and the sidebar themselves; listed so `?` shows them.
    { id: "key:palette", label: "Open command palette", group: "General", keys: "mod+k" },
    { id: "key:sidebar", label: "Toggle sidebar", group: "General", keys: "mod+b" },
  ])
}
