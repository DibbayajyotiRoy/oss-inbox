"use client"

import { useRouter, usePathname } from "next/navigation"
import { Check, ChevronsUpDown, FolderGit2 } from "lucide-react"

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { SidebarMenu, SidebarMenuButton, SidebarMenuItem, useSidebar } from "@/components/ui/sidebar"
import { repoPath } from "@/lib/fmt"
import { segOf } from "./nav"
import { useShell } from "./shell-context"

/** Org switcher and repo switcher, stacked in the sidebar header. They collapse to an avatar and an icon. */
export function Switchers() {
  const { me, orgId, repoId, overview } = useShell()
  const { isMobile } = useSidebar()
  const router = useRouter()
  const pathname = usePathname()
  const side = isMobile ? "bottom" : "right"
  const org = me.orgs.find((o) => o.id === orgId)
  const repo = overview?.repos.find((r) => r.id === repoId)
  // Switching repos keeps you on the same page (Thresholds stays Thresholds).
  const seg = segOf(pathname) ?? "queue"
  const orgName = org?.login ?? "Choose organization"
  const repoName = repo?.full_name.split("/")[1] ?? (repoId === null ? "Choose repository" : `Repository ${repoId}`)

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton tooltip="Organization" aria-label={`${orgName}, switch organization`}>
              <Avatar className="size-5 rounded-md">
                <AvatarImage src={org?.avatar_url} alt="" />
                <AvatarFallback className="rounded-md text-[10px]">{org?.login[0]?.toUpperCase() ?? "?"}</AvatarFallback>
              </Avatar>
              <span className="truncate font-medium">{orgName}</span>
              <ChevronsUpDown className="ml-auto opacity-60" />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent side={side} align="start" className="min-w-56">
            <DropdownMenuLabel>Organizations</DropdownMenuLabel>
            {me.orgs.map((o) => (
              <DropdownMenuItem key={o.id} onSelect={() => router.push(`/orgs/${o.id}`)}>
                <Avatar className="size-5 rounded-md">
                  <AvatarImage src={o.avatar_url} alt="" />
                  <AvatarFallback className="rounded-md text-[10px]">{o.login[0]?.toUpperCase()}</AvatarFallback>
                </Avatar>
                <span className="truncate">{o.login}</span>
                {o.id === orgId ? <Check className="ml-auto" /> : null}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>

      {orgId !== null ? (
        <SidebarMenuItem>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <SidebarMenuButton tooltip="Repository" aria-label={`${repoName}, switch repository`}>
                <FolderGit2 />
                <span className="truncate">{repoName}</span>
                <ChevronsUpDown className="ml-auto opacity-60" />
              </SidebarMenuButton>
            </DropdownMenuTrigger>
            <DropdownMenuContent side={side} align="start" className="max-h-80 min-w-56 overflow-y-auto">
              <DropdownMenuItem onSelect={() => router.push(`/orgs/${orgId}`)}>All repositories</DropdownMenuItem>
              {overview?.repos.length ? <DropdownMenuSeparator /> : null}
              {overview?.repos.map((r) => (
                <DropdownMenuItem key={r.id} onSelect={() => router.push(repoPath(r.id, seg))}>
                  <span className="truncate">{r.full_name.split("/")[1]}</span>
                  {r.enabled ? null : <Badge className="ml-auto">Off</Badge>}
                  {r.id === repoId ? <Check className="ml-auto" /> : null}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </SidebarMenuItem>
      ) : null}
    </SidebarMenu>
  )
}
