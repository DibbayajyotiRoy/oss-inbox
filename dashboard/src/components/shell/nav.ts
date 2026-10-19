import { Bug, ChartColumn, CirclePause, Inbox, Settings, ShieldCheck, SlidersHorizontal, Target, type LucideIcon } from "lucide-react"

export interface NavItem {
  /** Last path segment under /repos/[id]/. */
  seg: string
  label: string
  icon: LucideIcon
  /** Go-to sequence ("g q"), bound globally and listed in `?`. */
  keys: string
  /** Which open-count on the repo card to show as a badge. */
  count?: "queued_open" | "held_open"
}

export const NAV: { label: string; items: NavItem[] }[] = [
  {
    label: "Review",
    items: [
      { seg: "queue", label: "Needs review", icon: Inbox, keys: "g q", count: "queued_open" },
      { seg: "held", label: "Held for a check", icon: CirclePause, keys: "g h", count: "held_open" },
    ],
  },
  {
    label: "Check Jev",
    items: [
      { seg: "thresholds", label: "How sure Jev must be", icon: SlidersHorizontal, keys: "g t" },
      { seg: "calibration", label: "Honesty check", icon: Target, keys: "g c" },
      { seg: "evaluation", label: "Accuracy", icon: ChartColumn, keys: "g v" },
    ],
  },
  {
    label: "Automation",
    items: [
      { seg: "ci-gate", label: "CI failures", icon: ShieldCheck, keys: "g i" },
      { seg: "flaky", label: "Random test failures", icon: Bug, keys: "g f" },
    ],
  },
  { label: "Settings", items: [{ seg: "settings", label: "Settings", icon: Settings, keys: "g s" }] },
]

export const NAV_ITEMS = NAV.flatMap((s) => s.items)

/** The nav segment of a repo page path, or undefined elsewhere. */
export const segOf = (pathname: string) => /^\/repos\/[^/]+\/([^/]+)/.exec(pathname)?.[1]

/** Top-bar title for a path. */
export function titleFor(pathname: string) {
  const seg = segOf(pathname)
  if (seg) return NAV_ITEMS.find((i) => i.seg === seg)?.label ?? "Repository"
  if (pathname.startsWith("/items/")) return "Item"
  if (pathname.startsWith("/orgs/")) return "All repositories"
  return "OSS Inbox"
}
