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
      { seg: "queue", label: "Queue", icon: Inbox, keys: "g q", count: "queued_open" },
      { seg: "held", label: "Held", icon: CirclePause, keys: "g h", count: "held_open" },
    ],
  },
  {
    label: "Measure",
    items: [
      { seg: "thresholds", label: "Thresholds", icon: SlidersHorizontal, keys: "g t" },
      { seg: "calibration", label: "Calibration", icon: Target, keys: "g c" },
      { seg: "evaluation", label: "Evaluation", icon: ChartColumn, keys: "g v" },
    ],
  },
  {
    label: "Automate",
    items: [
      { seg: "ci-gate", label: "CI gate", icon: ShieldCheck, keys: "g i" },
      { seg: "flaky", label: "Flaky tests", icon: Bug, keys: "g f" },
    ],
  },
  { label: "Configure", items: [{ seg: "settings", label: "Settings", icon: Settings, keys: "g s" }] },
]

export const NAV_ITEMS = NAV.flatMap((s) => s.items)

/** The nav segment of a repo page path, or undefined elsewhere. */
export const segOf = (pathname: string) => /^\/repos\/[^/]+\/([^/]+)/.exec(pathname)?.[1]

/** Top-bar title for a path. */
export function titleFor(pathname: string) {
  const seg = segOf(pathname)
  if (seg) return NAV_ITEMS.find((i) => i.seg === seg)?.label ?? "Repository"
  if (pathname.startsWith("/items/")) return "Item"
  if (pathname.startsWith("/orgs/")) return "Repositories"
  return "Jev Triage"
}
