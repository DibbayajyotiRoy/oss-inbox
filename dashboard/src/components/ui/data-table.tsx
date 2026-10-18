"use client"

import * as React from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Select } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { useScrollable } from "@/lib/use-scrollable"
import { cn } from "@/lib/utils"

export type Column<T> = {
  key: string
  header: React.ReactNode
  /** Defaults to `row[key]`, with "–" for a missing value. */
  cell?: (row: T) => React.ReactNode
  align?: "right" | "center"
  /** CSS width of the column, e.g. `"8rem"`. */
  width?: string
  /** For both header and cells, e.g. `"max-sm:hidden"`. */
  className?: string
}

/** Choices for rows shown at once; 0 = all. */
const CHOICES = [5, 10, 25, 50, 0]
const rowsKey = (key: string) => `dt:${key}`
const readRows = (key?: string) => {
  try {
    const raw = key ? localStorage.getItem(rowsKey(key)) : null
    return raw !== null && CHOICES.includes(Number(raw)) ? Number(raw) : null
  } catch {
    return null // storage blocked: use the default
  }
}
const subscribe = (cb: () => void) => {
  window.addEventListener("storage", cb) // another tab picked
  return () => window.removeEventListener("storage", cb)
}
/** First-paint height guess (header h-10, row py-2.5 + one text-sm line + border) until the real rows are measured. */
const guess = (n: number) => 40 + 41 * n
const ALIGN = { right: "text-right", center: "text-center" }

/**
 * The one table. Shows at most N rows (default 10), then the body scrolls under a sticky header; the footer
 * "Rows" select lets the user pick 5 / 10 / 25 / 50 / All, remembered per `storageKey`. The box height is the
 * measured height of the first N rows, so it never jumps. Below sm it scrolls sideways with a fade edge.
 * Client components only (columns carry functions). The header paints `bg-card`; on a bare page pass
 * `className="[&_th]:bg-background"`.
 */
export function DataTable<T>({
  columns,
  rows,
  rowKey,
  label,
  storageKey,
  defaultRows = 10,
  onRowClick,
  rowHref,
  empty,
  className,
}: {
  columns: Column<T>[]
  rows: T[]
  rowKey: (row: T) => string | number
  /** Accessible name of the table and of its scroll region. */
  label: string
  /** Remember the rows choice under this key (localStorage). */
  storageKey?: string
  /** One of 5, 10, 25, 50, 0 (all). */
  defaultRows?: number
  onRowClick?: (row: T) => void
  /** Row link: the first cell becomes a real link and the whole row clicks through. */
  rowHref?: (row: T) => string
  /** Shown instead of the table when there are no rows. */
  empty?: React.ReactNode
  className?: string
}) {
  const router = useRouter()
  const scroll = useScrollable<HTMLDivElement>(label)
  const tableRef = React.useRef<HTMLTableElement>(null)
  // Server and first client render use the default; the stored choice joins right after hydration.
  const stored = React.useSyncExternalStore(subscribe, () => readRows(storageKey), () => null)
  const [picked, setPicked] = React.useState<number>()
  const n = picked ?? stored ?? defaultRows
  const limited = n > 0 && rows.length > n

  // Box height = top of row N+1 (header + N rows exactly); written to the DOM, no re-render. Also the sideways fade.
  React.useLayoutEffect(() => {
    const table = tableRef.current
    const box = table?.closest<HTMLElement>("[data-slot=data-table-scroll]")
    if (!table || !box) return
    const fade = () => box.toggleAttribute("data-more", box.scrollLeft + box.clientWidth < box.scrollWidth - 1)
    const sync = () => {
      const next = limited ? table.tBodies[0]?.rows[n]?.offsetTop : undefined
      box.style.maxHeight = next ? `${next + box.offsetHeight - box.clientHeight}px` : "" // + a sideways scrollbar, if any
      fade()
    }
    sync()
    const ro = new ResizeObserver(sync)
    ro.observe(table)
    ro.observe(box)
    box.addEventListener("scroll", fade, { passive: true })
    return () => {
      ro.disconnect()
      box.removeEventListener("scroll", fade)
    }
  }, [n, limited])

  if (!rows.length && empty) return <>{empty}</>

  const pick = (v: number) => {
    setPicked(v)
    try {
      if (storageKey) localStorage.setItem(rowsKey(storageKey), String(v))
    } catch {}
  }
  const inner = (e: React.SyntheticEvent) => !!(e.target as HTMLElement).closest("a, button, input, select, textarea, label, [role=button]")
  const clickable = !!(onRowClick || rowHref)

  return (
    <div data-slot="data-table" className={cn("min-w-0", className)}>
      <div
        data-slot="data-table-scroll"
        {...scroll}
        style={{ maxHeight: limited ? guess(n) : undefined }}
        className={cn(
          "relative isolate overflow-auto overscroll-x-contain outline-none [scrollbar-gutter:stable] focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset",
          // The box does all the scrolling; Table's own wrapper (clip, because `sticky`) would cut wide rows off.
          "[&>[data-slot=table-container]]:overflow-visible",
          // Sticky header: opaque, with a hairline that stays put (a collapsed border would scroll away with its row).
          "[&_thead_th]:bg-card [&_thead_th]:shadow-[inset_0_-1px_0_var(--border)] [&_thead_tr]:border-b-0",
          "max-sm:data-[more]:[mask-image:linear-gradient(to_right,black_calc(100%_-_2rem),transparent)]"
        )}
      >
        <Table ref={tableRef} sticky aria-label={label}>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              {columns.map((c) => (
                <TableHead key={c.key} style={{ width: c.width }} className={cn(c.align && ALIGN[c.align], c.className)}>
                  {c.header}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => {
              const href = rowHref?.(row)
              return (
                <TableRow
                  key={rowKey(row)}
                  tabIndex={onRowClick ? 0 : undefined}
                  className={cn(clickable && "cursor-pointer", onRowClick && "outline-none focus-visible:bg-muted/40 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset")}
                  onClick={clickable ? (e) => !inner(e) && (href ? router.push(href) : onRowClick?.(row)) : undefined}
                  onKeyDown={onRowClick ? (e) => e.target === e.currentTarget && (e.key === "Enter" || e.key === " ") && (e.preventDefault(), onRowClick(row)) : undefined}
                >
                  {columns.map((c, i) => {
                    const v = c.cell ? c.cell(row) : (row as Record<string, unknown>)[c.key]
                    const content = v == null || v === "" ? "–" : v
                    return (
                      <TableCell key={c.key} className={cn(c.align && ALIGN[c.align], c.className)}>
                        {href && i === 0 ? (
                          <Link href={href} className="link-grow rounded-sm underline-offset-4 outline-none focus-visible:ring-2 focus-visible:ring-ring">
                            {content as React.ReactNode}
                          </Link>
                        ) : (
                          (content as React.ReactNode)
                        )}
                      </TableCell>
                    )
                  })}
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </div>
      {rows.length > CHOICES[0] && (
        <div className="flex items-center justify-between gap-3 pt-3 text-xs text-muted-foreground tabular-nums">
          <span aria-live="polite">
            Showing {limited ? n : rows.length} of {rows.length}
          </span>
          <span className="flex items-center gap-2">
            Rows
            <Select size="sm" aria-label="Rows shown" wrapperClassName="w-[4.5rem]" value={String(n)} onValueChange={(v) => pick(Number(v))}>
              {CHOICES.map((c) => (
                <option key={c} value={c}>
                  {c || "All"}
                </option>
              ))}
            </Select>
          </span>
        </div>
      )}
    </div>
  )
}
