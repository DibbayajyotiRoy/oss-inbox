"use client"

import { Dialog } from "@/components/ui/dialog"
import { Kbd } from "@/components/ui/kbd"
import { groupRank, keyCaps, useMod, useRegisteredCommands } from "./commands"

/** `?`: every registered command that has `keys`, grouped. Screens add rows with `useCommands`. */
export function ShortcutsDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const mod = useMod()
  const groups = Map.groupBy(
    useRegisteredCommands().filter((c) => c.keys),
    (c) => c.group ?? "Commands",
  )
  return (
    <Dialog open={open} onOpenChange={onOpenChange} title="Keyboard shortcuts" className="sm:max-w-md">
      <div className="flex flex-col gap-5">
        {[...groups].sort(([a], [b]) => groupRank(a) - groupRank(b)).map(([group, list]) => (
          <section key={group}>
            <h3 className="mb-1.5 text-[13px] font-medium text-muted-foreground">{group}</h3>
            <ul className="divide-y divide-border">
              {list.map((c) => (
                <li key={c.id} className="flex items-center justify-between gap-4 py-2">
                  <span>{c.label}</span>
                  <span className="flex shrink-0 items-center gap-1">
                    {keyCaps(c.keys!, mod).map((k, i) => (
                      <Kbd key={i}>{k}</Kbd>
                    ))}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </Dialog>
  )
}
