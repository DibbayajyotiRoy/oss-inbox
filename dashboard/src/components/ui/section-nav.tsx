"use client"

import * as React from "react"
import { ChevronDown } from "lucide-react"
import { Button } from "@/components/ui/button"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { cn } from "@/lib/utils"

type Item = { id: string; label: string }

/** A section counts as "being read" once its top passes this fraction of the scroller's height. */
const LINE = 0.3

/** One page section. `SectionNav` finds these by `data-section`, so sections that mount late (after a fetch) join the nav. */
export function Section({ id, label, className, ...props }: React.ComponentProps<"section"> & { id: string; label: string }) {
  return <section id={id} data-section={label} className={cn("scroll-mt-16 xl:scroll-mt-6", className)} {...props} />
}

/** Move focus to a section's heading (or the section), so keyboard and screen reader users land where the view did. */
function focusSection(id: string) {
  const section = document.getElementById(id)
  const heading = section?.querySelector<HTMLElement>("h1, h2, h3, h4, h5, h6") ?? section
  if (!heading) return
  heading.tabIndex = -1
  heading.focus({ preventScroll: true })
}

/**
 * Wrap a long page's `<Section>`s. At xl+ a sticky right rail lists them with the one being read marked;
 * below xl a sticky "On this page" menu does the same. Clicking scrolls (smoothly unless reduced motion),
 * sets the `#hash` and moves focus to the section heading. Hidden while the page has fewer than two sections.
 * Scroll-spy runs against the app's `#content` scroller (`[data-scroll-root]`), falling back to the window.
 */
export function SectionNav({ children, className }: { children: React.ReactNode; className?: string }) {
  const body = React.useRef<HTMLDivElement>(null)
  const rail = React.useRef<HTMLUListElement>(null)
  const bar = React.useRef<HTMLSpanElement>(null)
  const pinned = React.useRef<string | null>(null) // set by a click: stays active until the user scrolls on their own
  const picked = React.useRef<string | undefined>(undefined) // the menu item chosen; focus moves once the menu has closed
  const [items, setItems] = React.useState<Item[]>([])
  const [active, setActive] = React.useState<string>()

  React.useEffect(() => {
    const el = body.current
    if (!el) return
    const root = el.closest<HTMLElement>("[data-scroll-root]")
    const target: HTMLElement | Window = root ?? window
    const sc = root ?? document.documentElement
    let secs: HTMLElement[] = []
    let frame = 0
    let scanFrame = 0
    let bottom = false

    const atBottom = () => sc.scrollHeight - sc.clientHeight > 1 && sc.scrollTop >= sc.scrollHeight - sc.clientHeight - 2
    const compute = () => {
      frame = 0
      if (pinned.current) return
      const line = (root?.getBoundingClientRect().top ?? 0) + (root?.clientHeight ?? window.innerHeight) * LINE
      bottom = atBottom()
      let next = secs[0]?.id
      for (const s of secs) if (bottom || s.getBoundingClientRect().top <= line) next = s.id // bottom: the last one wins
      setActive(next)
    }
    const schedule = () => {
      frame ||= requestAnimationFrame(compute)
    }
    // A band from the scroller's top to the reading line: a section crossing it is when the active one can change.
    const io = new IntersectionObserver(schedule, { root, rootMargin: `0px 0px -${(1 - LINE) * 100}% 0px`, threshold: [0, 1] })
    const scan = () => {
      scanFrame = 0
      const found = [...el.querySelectorAll<HTMLElement>("[data-section]")]
      if (found.length === secs.length && found.every((s, i) => s === secs[i])) return
      io.disconnect()
      secs = found
      found.forEach((s) => io.observe(s))
      setItems(found.map((s) => ({ id: s.id, label: s.dataset.section ?? s.id })))
      schedule()
    }
    const mo = new MutationObserver(() => {
      scanFrame ||= requestAnimationFrame(scan)
    })
    mo.observe(el, { childList: true, subtree: true })
    scanFrame = requestAnimationFrame(scan)

    const onScroll = () => {
      if (!pinned.current && atBottom() !== bottom) schedule() // the last section can be too short to cross the line
    }
    // Only real input releases a click's pin; the smooth scroll it started does not.
    const release = () => {
      if (!pinned.current) return
      pinned.current = null
      schedule()
    }
    const input = ["wheel", "touchmove", "keydown", "pointerdown"] as const
    target.addEventListener("scroll", onScroll, { passive: true })
    input.forEach((t) => target.addEventListener(t, release, { passive: true }))
    return () => {
      cancelAnimationFrame(frame)
      cancelAnimationFrame(scanFrame)
      io.disconnect()
      mo.disconnect()
      target.removeEventListener("scroll", onScroll)
      input.forEach((t) => target.removeEventListener(t, release))
    }
  }, [])

  // Slide the rail's marker to the active link (transform + height only; the first placement doesn't glide).
  React.useLayoutEffect(() => {
    const list = rail.current
    const mark = bar.current
    if (!list || !mark) return
    const place = () => {
      const link = list.querySelector<HTMLElement>("[aria-current]")
      mark.style.opacity = link ? "1" : "0"
      if (!link) return
      mark.style.transform = `translateY(${link.offsetTop}px)`
      mark.style.height = `${link.offsetHeight}px`
      requestAnimationFrame(() => (mark.dataset.ready = ""))
    }
    place()
    const ro = new ResizeObserver(place) // the rail is display:none below xl
    ro.observe(list)
    return () => ro.disconnect()
  }, [active, items])

  const go = (id: string) => {
    const section = document.getElementById(id)
    if (!section) return
    pinned.current = id
    setActive(id)
    section.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" })
    window.history.replaceState(null, "", `#${id}`)
  }

  const current = items.find((i) => i.id === active) ?? items[0]
  const show = items.length > 1

  return (
    <div className={cn("xl:grid xl:grid-cols-[minmax(0,1fr)_9.5rem] xl:gap-8", className)}>
      {show && (
        <div className="sticky top-0 z-10 -mx-4 mb-6 border-b border-border bg-background/90 px-4 py-2 backdrop-blur sm:-mx-6 sm:px-6 lg:-mx-10 lg:px-10 xl:hidden">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="max-w-full justify-start">
                <span className="text-muted-foreground">On this page</span>
                <span className="truncate">{current.label}</span>
                <ChevronDown className="ml-auto" aria-hidden />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="start"
              onCloseAutoFocus={(e) => {
                if (!picked.current) return // dismissed: focus goes back to the trigger
                e.preventDefault()
                focusSection(picked.current)
                picked.current = undefined
              }}
            >
              {items.map((i) => (
                <DropdownMenuItem key={i.id} aria-current={i.id === current.id ? "location" : undefined} className="aria-[current=location]:font-medium" onSelect={() => {
                    picked.current = i.id
                    go(i.id)
                  }}>
                  {i.label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      )}
      <div ref={body} className="min-w-0">
        {children}
      </div>
      {show && (
        <nav aria-label="On this page" className="sticky top-6 hidden self-start xl:block">
          <ul ref={rail} className="relative border-l border-border">
            <span
              ref={bar}
              aria-hidden
              className="pointer-events-none absolute top-0 -left-px w-0.5 bg-foreground opacity-0 motion-safe:data-[ready]:transition-[transform,height] motion-safe:data-[ready]:duration-250 motion-safe:data-[ready]:ease-settle"
            />
            {items.map((i) => (
              <li key={i.id}>
                <a
                  href={`#${i.id}`}
                  aria-current={i.id === current.id ? "location" : undefined}
                  onClick={(e) => {
                    if (e.button || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return // new tab etc.
                    e.preventDefault()
                    go(i.id)
                    focusSection(i.id)
                  }}
                  className="block rounded-r-md py-1 pr-1 pl-3 text-[13px] leading-5 text-muted-foreground outline-none motion-safe:transition-[color] motion-safe:duration-150 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring aria-[current=location]:text-foreground"
                >
                  {i.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>
      )}
    </div>
  )
}
