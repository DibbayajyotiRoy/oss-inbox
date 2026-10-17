import type { ReactNode } from "react"
import Link from "next/link"
import { ArrowUpRight } from "lucide-react"

import { cn } from "@/lib/utils"
import { InfoHint } from "./info-hint"

/** Metrics as an unboxed `<dl>`: label, value, detail, aligned across peers. Not cards. */
export function StatStrip({ children, className }: { children: ReactNode; className?: string }) {
  return <dl className={cn("grid grid-cols-2 gap-x-8 gap-y-6 border-t border-border pt-6 lg:grid-cols-4", className)}>{children}</dl>
}

/** One metric. With `href` the whole tile is a link (hover surface, arrow fades in). Always show `n` in `detail` for accuracy numbers. */
export function Stat({
  label,
  value,
  detail,
  hint,
  href,
}: {
  label: ReactNode
  value: ReactNode
  detail?: ReactNode
  /** (i) tooltip after the label. */
  hint?: ReactNode
  href?: string
}) {
  return (
    <div
      className={cn(
        "min-w-0",
        // Negative margin + equal padding keeps text aligned with unlinked peers.
        href &&
          "group/stat relative -m-2 rounded-lg p-2 ring-1 ring-transparent ring-inset motion-safe:transition-[background-color,box-shadow] motion-safe:duration-150 motion-safe:ease-settle hover:bg-accent hover:ring-border has-[a:focus-visible]:bg-accent"
      )}
    >
      <dt className={cn("text-[13px] font-medium text-muted-foreground", href && "group-hover/stat:text-foreground")}>
        {href ? (
          <Link
            href={href}
            className="group inline-flex items-center gap-1 rounded-sm outline-none after:absolute after:inset-0 after:rounded-lg focus-visible:after:ring-2 focus-visible:after:ring-ring"
          >
            {label}
            <ArrowUpRight
              aria-hidden
              className="size-3.5 shrink-0 opacity-0 motion-safe:transition-[opacity,translate] motion-safe:duration-150 group-hover:opacity-100 group-focus-visible:opacity-100 motion-safe:group-hover:translate-x-px motion-safe:group-hover:-translate-y-px"
            />
          </Link>
        ) : (
          label
        )}
        {hint ? (
          <InfoHint className="z-10 ml-1.5" label="About this number">
            {hint}
          </InfoHint>
        ) : null}
      </dt>
      <dd className="mt-1 text-2xl font-semibold tracking-tight text-foreground tabular-nums">{value}</dd>
      {detail ? <dd className={cn("mt-1 text-xs text-muted-foreground", href && "group-hover/stat:text-foreground/80")}>{detail}</dd> : null}
    </div>
  )
}
