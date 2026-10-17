import * as React from "react"

import { cn } from "@/lib/utils"

function Kbd({ className, ...props }: React.ComponentProps<"kbd">) {
  return (
    <kbd
      data-slot="kbd"
      className={cn(
        "inline-flex h-5 min-w-5 items-center justify-center rounded-[5px] border border-b-2 border-border bg-muted px-1 font-mono text-[11px] font-medium text-muted-foreground select-none",
        className
      )}
      {...props}
    />
  )
}

export { Kbd }
