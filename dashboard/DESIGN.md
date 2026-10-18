# Jev Triage dashboard: design system

Reference look: webora-ui dashboard (`/home/roy/Documents/webora-ui`, spec in its `docs/DESIGN.md`).
Linear/Apple-level restraint. Read that spec and its `src/components/{ui,shell,dashboard,onboarding}` before
building; port patterns, do not copy product copy.

## Concept card
```
Idea:        A calibrated instrument, not an assistant. Every decision is a reading with a needle, a threshold and a sample size.
Metaphor:    Lab instruments: gauges, tolerances, calibration certificates.
Signature:   The threshold control. Dragging the threshold moves a tick across the confidence distribution
             (Evil area chart) while three counts (auto-acted, queued, wrongly acted) roll to new values. The same
             "meter + threshold tick" appears small on every decision row, so the signature is everywhere.
Emotion:     Calm control. "Nothing happens unless I say so, and I can see why."
Motion verb: Settle like a needle: short spring that overshoots ~2% and settles (≈250ms, cubic-bezier(.2,.8,.2,1)).
Screenshot:  Thresholds page mid-drag: distribution, tick, counts, "would have been wrong 3 of 412".
```

## Tokens (Tailwind v4, `@theme inline`, `.dark` class via next-themes, default dark + system)
Graphite monochrome from webora-ui (Radix Slate). Colour only when it carries meaning.
- light: background #fcfcfd, foreground #1c2024, card #fff, muted #f0f0f3, muted-fg #60646c, accent #e8e8ec,
  border #d9d9e0, input #cdced6, ring #80838d, sidebar #f9f9fb
- dark: background #111113, foreground #edeef0, card #18191b, popover #212225, muted #212225, muted-fg #b0b4ba,
  accent #272a2d, border #2e3135, input #363a3f, ring #777b84, sidebar #18191b
- semantic: success (#1a6b46 / #3dd68c), warning (#7e5616 / #dcb36c), destructive (#a63636 / #e8817a),
  info (#0b5fa9 / #70b8ff); each is >= 4.5:1 as text on its own 10% tint over background, card, muted and accent. **Threshold tick** uses `--warning`. Auto-acted = foreground, queued = muted-fg,
  wrong = destructive. Shadow = dashed foreground/40.
- chart ramp: --chart-1..5 graphite (foreground → border).
- radius 8px (cards rounded-xl=8px, controls rounded-md). Shadows: xs inputs, sm cards, md menus, lg dialogs.
- Type: Geist + Geist Mono (next/font/google). Page title text-2xl semibold tracking-tight; section text-lg;
  body text-sm; label 13px medium; caption text-xs; numbers always `tabular-nums`. Mono only for ids, YAML, state text.
- Spacing: page `px-4 sm:px-6 lg:px-10 py-8`, max-w-6xl, groups gap-10, grids gap-4/6. Compact density (rows py-2.5, controls h-9/h-8).

## Shell
Inset sidebar (shadcn `Sidebar variant="inset" collapsible="icon"`) on `bg-sidebar`, content panel `m-2 ml-0 rounded-lg border`.
Only the content panel scrolls. Sidebar: org switcher, repo switcher, nav groups (Review: Queue, Held · Measure:
Thresholds, Calibration, Evaluation · Automate: CI gate, Flaky tests · Configure: Settings), gliding active indicator
+ blur-in hover pill, open-count badges on Queue/Held. Top bar h-12: sidebar trigger, page title, ⌘K button, docs,
theme toggle. **⌘K command palette (cmdk)**: go to any repo/page, jump to item #number, run backfill, toggle theme,
copy CI curl. Keyboard help on `?`.

## Components (shadcn new-york + radix-ui, cva, lucide 16px)
button (press scale .98, 150ms), card, stat strip (unboxed dl), table (sticky header, row hover muted/40),
status (icon+text, not pills), badge, input/select/switch/checkbox, tabs with sliding indicator, dialog/sheet,
tooltip (inverted), toast stack (motion), skeleton mirroring layout, empty state (monochrome line art + ≤6-word title + one action),
progress, kbd, code block with copy, **Meter** (horizontal confidence bar with threshold tick; the signature atom).

## Charts: Evil Charts (shadcn registry, recharts + motion)
Install via `npx shadcn@latest add https://evilcharts.com/r/<name>.json` (area, bar, line, composed).
Map ChartConfig colors to the graphite ramp + semantic colors (`colors: {light: [...], dark: [...]}`).
`animationType="none"` in dense lists and under reduced motion. No scatter/heatmap in Evil Charts:
calibration = composed/line (observed vs dashed diagonal); confusion matrix = CSS grid heat cells.
Every chart point/cell links to the items behind it.

## Onboarding (world-class, the first 5 minutes)
Route `/welcome` (instance) and `/onboarding/[repoId]` (per repo; outside the app shell). Webora-style frame: h-16 header, centered
max-w-3xl, step dots ("Step 2 of 6"), Back/Continue footer, Enter continues, focus moves to heading, 8px directional slide.
Instance steps (GET /api/setup/status): 1 decision backend key present (copyable env line, docs link,
"uncalibrated" warning for anthropic) → 2 create GitHub App (button → /api/setup manifest flow) → 3 install on org
(install_url) → 4 pick repos. Repo steps (GET /api/repos/:id/onboarding): enable (private ack), sync labels (diff preview),
config file (render + GitHub link; optional), **measure** (run backfill, live progress from GET /api/repos/:id/backfill,
accuracy table settles in as it completes: the onboarding signature), choose mode per feature (shadow default; auto only
for measured questions), done → queue. Demo mode banner + "Try with sample data" path on login.

## Copy rules
Sentence case. No em dashes. Titles ≤ 6 words, descriptions ≤ 8. Explanations go in (i) tooltips.
Every accuracy number shows its n. "Upper bound" note wherever backfill accuracy appears. Never say "AI-generated".

## Motion
One easing `cubic-bezier(.2,.8,.2,1)`; 150ms micro, 250ms indicators, 180/120ms dialogs; counts roll with motion.
List explicit properties (never `transition: all`). `motion-safe:` everywhere; reduced motion = instant.
Hover is a movement, not only a colour swap: buttons fill + lift 1px, icon buttons / segments / rows fade a pill in, chips lift,
text links draw their underline in (see COMPONENTS.md, Hover roles).
