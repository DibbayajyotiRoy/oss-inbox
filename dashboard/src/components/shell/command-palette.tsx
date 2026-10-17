"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Hash } from "lucide-react"

import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandShortcut,
} from "@/components/ui/command"
import { Kbd } from "@/components/ui/kbd"
import { groupRank, keyCaps, useMod, useRegisteredCommands, type Command } from "./commands"

/** ⌘K: every registered command, plus "Open item N" for a typed number. Commands come from `useCommands`. */
export function CommandPalette({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const router = useRouter()
  const mod = useMod()
  const [query, setQuery] = useState("")
  const runnable = useRegisteredCommands().filter((c) => c.run)
  const groups = Map.groupBy(runnable, (c) => c.group ?? "Commands")
  const itemId = /^#?(\d+)$/.exec(query.trim())?.[1]

  function pick(run: () => void) {
    onOpenChange(false)
    run()
  }

  return (
    <CommandDialog
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o)
        if (!o) setQuery("")
      }}
    >
      <CommandInput value={query} onValueChange={setQuery} placeholder="Go to a page, repo or item number…" />
      <CommandList>
        <CommandEmpty>No results.</CommandEmpty>
        {itemId ? (
          <CommandGroup heading="Items">
            <CommandItem forceMount value={`open item ${itemId}`} onSelect={() => pick(() => router.push(`/items/${itemId}`))}>
              <Hash /> Open item {itemId}
            </CommandItem>
          </CommandGroup>
        ) : null}
        {[...groups].sort(([a], [b]) => groupRank(a) - groupRank(b)).map(([group, list]) => (
          <CommandGroup key={group} heading={group}>
            {list.map((c) => (
              <PaletteItem key={c.id} command={c} mod={mod} onPick={pick} />
            ))}
          </CommandGroup>
        ))}
      </CommandList>
    </CommandDialog>
  )
}

function PaletteItem({ command: c, mod, onPick }: { command: Command; mod: string; onPick: (run: () => void) => void }) {
  const Icon = c.icon
  return (
    <CommandItem value={`${c.label} ${c.keywords ?? ""}`} onSelect={() => c.run && onPick(c.run)}>
      {Icon ? <Icon /> : null}
      {c.label}
      {c.keys ? (
        <CommandShortcut>
          {keyCaps(c.keys, mod).map((k, i) => (
            <Kbd key={i}>{k}</Kbd>
          ))}
        </CommandShortcut>
      ) : null}
    </CommandItem>
  )
}
