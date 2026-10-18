"use client"

import { usePathname } from "next/navigation"
import { BookOpen, Search } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Kbd } from "@/components/ui/kbd"
import { Separator } from "@/components/ui/separator"
import { SidebarTrigger } from "@/components/ui/sidebar"
import { useMod } from "./commands"
import { titleFor } from "./nav"
import { ThemeToggle } from "./theme-toggle"

const DOCS_URL = process.env.NEXT_PUBLIC_DOCS_URL ?? "https://github.com/YOUR-ORG/jev-triage/tree/main/docs"

export function SiteHeader({ onSearch }: { onSearch: () => void }) {
  const title = titleFor(usePathname())
  const mod = useMod()
  return (
    <header className="z-10 flex h-12 shrink-0 items-center gap-2 border-b border-border bg-background px-3 md:rounded-t-lg lg:px-4">
      <SidebarTrigger className="-ml-1" />
      <Separator orientation="vertical" className="mx-1 data-[orientation=vertical]:h-4" />
      <p className="min-w-0 truncate text-sm font-medium text-foreground">{title}</p>
      <div className="ml-auto flex items-center gap-2">
        <Button variant="outline" size="sm" onClick={onSearch} className="text-muted-foreground">
          <Search aria-hidden />
          <span className="max-sm:sr-only">Search</span>
          <Kbd className="hidden sm:inline-flex">{mod === "Ctrl" ? "Ctrl K" : `${mod}K`}</Kbd>
        </Button>
        <Button asChild variant="outline" size="sm">
          <a href={DOCS_URL} target="_blank" rel="noreferrer">
            <BookOpen aria-hidden />
            <span className="sr-only sm:not-sr-only">Docs</span>
            <span className="sr-only"> (opens in a new tab)</span>
          </a>
        </Button>
        <ThemeToggle />
      </div>
    </header>
  )
}
