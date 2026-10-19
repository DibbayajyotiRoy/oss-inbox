"use client"

import Link from "next/link"

import { Sidebar, SidebarContent, SidebarFooter, SidebarHeader, SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarRail } from "@/components/ui/sidebar"
import { NavMain } from "./nav-main"
import { Switchers } from "./switchers"
import { UserMenu } from "./user-menu"

export function AppSidebar({ onShortcuts }: { onShortcuts: () => void }) {
  return (
    <Sidebar collapsible="icon" variant="inset">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton asChild tooltip="OSS Inbox" className="font-semibold">
              <Link href="/">
                {/* A gauge: the mark stays put when the rail collapses; the name clips away behind it. */}
                <svg aria-hidden viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                  <path d="M2.5 11.5a6 6 0 1 1 11 0" />
                  <path d="m8 9 2.5-3.5" />
                </svg>
                <span>OSS Inbox</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
        <Switchers />
      </SidebarHeader>
      <SidebarContent className="relative">
        <NavMain />
      </SidebarContent>
      <SidebarFooter>
        <UserMenu onShortcuts={onShortcuts} />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  )
}
