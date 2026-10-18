"use client"

import { useRef } from "react"
import { useRouter } from "next/navigation"
import { ChevronsUpDown, Keyboard, LogOut, SunMoon } from "lucide-react"

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { SidebarMenu, SidebarMenuButton, SidebarMenuItem, useSidebar } from "@/components/ui/sidebar"
import { api } from "@/lib/api"
import { useShell } from "./shell-context"
import { useThemeToggle } from "./theme-toggle"

/** Ends the session and returns to the sign-in page. */
export function useSignOut() {
  const router = useRouter()
  return async () => {
    await api("/api/auth/logout", { method: "POST" }).catch(() => {})
    router.replace("/login")
  }
}

/** Sidebar footer: who you are, theme, shortcuts, sign out. */
export function UserMenu({ onShortcuts }: { onShortcuts: () => void }) {
  const { me } = useShell()
  const { isMobile } = useSidebar()
  const signOut = useSignOut()
  const { toggle } = useThemeToggle()
  // A dialog opened from the menu waits until the menu has handed focus back to its trigger, so Esc returns there.
  const later = useRef<() => void>(null)
  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton tooltip={me.login} aria-label={`${me.login}, account menu`}>
              <Avatar className="size-5">
                <AvatarImage src={me.avatar_url} alt="" />
                <AvatarFallback className="text-[10px]">{me.login[0]?.toUpperCase()}</AvatarFallback>
              </Avatar>
              <span className="truncate">{me.login}</span>
              <ChevronsUpDown className="ml-auto opacity-60" />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            side={isMobile ? "top" : "right"}
            align="end"
            className="min-w-52"
            onCloseAutoFocus={() => {
              const run = later.current
              later.current = null
              if (run) queueMicrotask(run)
            }}
          >
            <DropdownMenuLabel className="font-normal text-muted-foreground">Signed in as {me.login}</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={toggle}>
              <SunMoon /> Toggle theme
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => (later.current = onShortcuts)}>
              <Keyboard /> Keyboard shortcuts <DropdownMenuShortcut>?</DropdownMenuShortcut>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={signOut}>
              <LogOut /> Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  )
}
