"use client"

import * as React from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { LayoutGrid } from "lucide-react"

import {
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar"
import { FadePresence, SwapText } from "@/components/ui/presence"
import { repoPath } from "@/lib/fmt"
import { cn } from "@/lib/utils"
import { NAV, segOf } from "./nav"
import { useNavHover, useNavIndicator } from "./nav-motion"
import { useShell } from "./shell-context"

const label = (n: number) => (n > 99 ? "99+" : String(n))

/** Open-item count: a squircle when expanded, a mini pill on the icon's corner when collapsed. Digits roll on change. */
function CountBadge({ count }: { count: number }) {
  const [prev, setPrev] = React.useState(count)
  const [roll, setRoll] = React.useState<"up" | "down">("up")
  if (prev !== count) {
    setPrev(count)
    setRoll(count > prev ? "up" : "down")
  }
  return (
    <>
      <FadePresence
        show={count > 0}
        as="span"
        mode="fade-scale"
        className="pointer-events-none absolute top-1.5 right-2 group-data-[collapsible=icon]:hidden"
      >
        <span
          aria-hidden
          data-sidebar="menu-badge"
          className={cn(
            "flex h-5 min-w-5 items-center justify-center rounded-[6px] px-1.5 text-[11px] leading-none font-medium text-sidebar-foreground tabular-nums select-none",
            "bg-sidebar-foreground/[0.07] transition-colors duration-150 dark:bg-sidebar-foreground/10",
            // On the hovered or active row the pill steps up one shade to stay distinct.
            "group-hover/menu-item:bg-sidebar-foreground/10 group-has-[[data-active=true]]/menu-item:bg-sidebar-foreground/10",
            "dark:group-hover/menu-item:bg-sidebar-foreground/[0.14] dark:group-has-[[data-active=true]]/menu-item:bg-sidebar-foreground/[0.14]"
          )}
        >
          <SwapText value={label(count)} roll={roll} />
        </span>
      </FadePresence>
      {count > 0 ? (
        <span
          aria-hidden
          data-sidebar="menu-badge-collapsed"
          className="pointer-events-none absolute top-0 left-[22px] hidden h-4 min-w-4 items-center justify-center rounded-full bg-sidebar-foreground px-0.5 text-[9px] leading-none font-semibold whitespace-nowrap text-sidebar tabular-nums ring-2 ring-sidebar select-none group-data-[collapsible=icon]:flex"
        >
          <SwapText value={label(count)} roll={roll} />
        </span>
      ) : null}
    </>
  )
}

/** Org overview, then the repo's pages in groups. Active page glides (indicator), hover follows the pointer (pill). */
export function NavMain() {
  const pathname = usePathname()
  const { orgId, repoId, overview } = useShell()
  const { isMobile, setOpenMobile, state } = useSidebar()
  const layoutKey = `${state}:${isMobile}:${repoId}`
  const indicatorRef = useNavIndicator(pathname, layoutKey)
  const hoverRef = useNavHover(layoutKey)
  const card = overview?.repos.find((r) => r.id === repoId)
  const seg = repoId !== null && pathname.startsWith(`/repos/${repoId}/`) ? segOf(pathname) : undefined
  const close = () => isMobile && setOpenMobile(false)

  return (
    <>
      {/* Shared active fill, first in the DOM so the positioned items paint over it. */}
      <span
        ref={indicatorRef}
        aria-hidden
        className="pointer-events-none absolute top-0 left-0 rounded-md bg-sidebar-accent opacity-0 motion-safe:transition-[transform,height,opacity] motion-safe:duration-250 motion-safe:ease-settle"
      />
      {/* Shared hover fill: softer than the active fill, above it, below the items. */}
      <span ref={hoverRef} aria-hidden data-state="hidden" className="nav-hover-pill pointer-events-none absolute top-0 left-0 rounded-md bg-sidebar-accent/70" />

      {orgId !== null ? (
        <SidebarGroup className="pb-0">
          <SidebarMenu>
            <NavLink href={`/orgs/${orgId}`} label="All repositories" icon={LayoutGrid} active={pathname.startsWith("/orgs/")} onNavigate={close} />
          </SidebarMenu>
        </SidebarGroup>
      ) : null}

      {repoId !== null
        ? NAV.map((section) => (
            <SidebarGroup key={section.label}>
              {/* The group you are in reads a step stronger. */}
              <SidebarGroupLabel
                data-current={section.items.some((i) => i.seg === seg) || undefined}
                className="data-[current=true]:text-sidebar-foreground"
              >
                {section.label}
              </SidebarGroupLabel>
              <SidebarMenu>
                {section.items.map((item) => (
                  <NavLink
                    key={item.seg}
                    href={repoPath(repoId, item.seg)}
                    label={item.label}
                    icon={item.icon}
                    active={item.seg === seg}
                    count={item.count && card ? card[item.count] : undefined}
                    onNavigate={close}
                  />
                ))}
              </SidebarMenu>
            </SidebarGroup>
          ))
        : null}
    </>
  )
}

function NavLink({
  href,
  label: text,
  icon: Icon,
  active,
  count,
  onNavigate,
}: {
  href: string
  label: string
  icon: React.ComponentType
  active: boolean
  count?: number
  onNavigate: () => void
}) {
  const counted = count !== undefined && count > 0
  const name = counted ? `${text}, ${count} open` : text
  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        asChild
        isActive={active}
        tooltip={name.replace(", ", " · ")}
        className={cn(
          // Leaves room for the count badge so a long label truncates before it.
          "group-has-data-[sidebar=menu-badge]/menu-item:pr-14",
          // Colour crossfades while the shared indicator glides in behind; press sinks to 98%.
          "transition-[width,height,padding,color,transform] motion-safe:active:scale-[0.98]",
          // Once the indicator / hover pill are live, items stop painting their own fills.
          "in-data-[nav-indicator=ready]:data-[active=true]:bg-transparent!",
          "in-data-[nav-hover=ready]:hover:bg-transparent! in-data-[nav-hover=ready]:active:bg-transparent! before:hidden",
          !active && "text-muted-foreground hover:text-sidebar-accent-foreground"
        )}
      >
        <Link href={href} onClick={onNavigate} aria-current={active ? "page" : undefined} aria-label={counted ? name : undefined}>
          <Icon />
          <span>{text}</span>
        </Link>
      </SidebarMenuButton>
      {count !== undefined ? <CountBadge count={count} /> : null}
    </SidebarMenuItem>
  )
}
