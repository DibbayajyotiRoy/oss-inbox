# Components

The design system is in `src/components/ui/*` (shadcn new-york + Radix, restyled to DESIGN.md), the app frame in
`src/components/shell/*`, charts in `src/components/evilcharts/*`. Import from the file, never from a barrel:
`import { Button } from "@/components/ui/button"`. Tokens live in `src/app/globals.css`; never hard-code hex
(the one exception is `src/lib/chart-theme.ts`). Utilities: `ease-settle` (the one easing), `ease-needle`
(2% overshoot spring, use with `duration-250`), Tailwind's `tabular-nums` on every number.

`src/components/ui.tsx` and the `.btn .card .input .note`, `text-muted`, `bg-surface`, `border-line` classes
(bottom of `globals.css`) are a **legacy shim** for unmigrated pages. Do not use them in new code; delete them
when the last page is migrated. In new code `muted` is a surface, text is `text-muted-foreground`.

## Primitives (`@/components/ui/<file>`)

| File | Exports and key props |
|---|---|
| `button` | `Button` variant `primary\|secondary\|outline\|ghost\|destructive\|link`, size `sm\|md\|lg\|icon\|icon-sm`, `loading`, `asChild` (wrap `Link`) |
| `card` | `Card`, `CardHeader/Title/Description/Action/Content/Footer`; **`CardSection`** `{title, description?, hint?, action?, footer?}` is the usual card |
| `badge` | `Badge` variant `secondary\|default\|outline\|success\|warning\|info\|destructive`. Counts, roles, modes only |
| `status` | `Status` `{tone: success\|danger\|warning\|progress\|waiting\|neutral, icon?}`: icon + text, never colour alone. Use for states |
| `input` `textarea` `label` | shadcn; set `aria-invalid` for errors |
| `field` | `Field` `{label, htmlFor, hint?, error?, hintPlacement?: below\|inline}`; give the control `id={htmlFor}` |
| `select` | `Select` is a drop-in for native `<select>` (`<option>` children, `value`, `onChange` or `onValueChange`, `placeholder`); parts `SelectRoot/Trigger/Content/Item...` for custom |
| `switch` | `Switch` (Radix: `checked`, `onCheckedChange`, `size`) |
| `checkbox` | `Checkbox` native input look: `checked`/`defaultChecked`, `onChange` or `onCheckedChange(bool)` |
| `tabs` | `Tabs` `{items: {id, label, icon?}[], value, onValueChange, variant: line\|segmented}`. Controlled, you render the panel. Sliding pill + underline (`line`) or sliding fill (`segmented`) |
| `dialog` | `Dialog` `{open, onOpenChange, title, description?, footer?, className}` + children as body. Parts: `DialogRoot/Trigger/Content/Header/Footer/Title/Description` |
| `sheet` | shadcn `Sheet`, `SheetTrigger/Content(side)/Header/Title/Description/Footer/Close` |
| `dropdown-menu` | shadcn `DropdownMenu*` |
| `popover` | shadcn `Popover`, `PopoverTrigger`, `PopoverContent` |
| `tooltip` | `Tooltip`, `TooltipTrigger`, `TooltipContent` (inverted). `TooltipProvider` is already in the root |
| `toaster` | `toast("Saved")`, `toast.success/error/info/loading(title, {id?, description?, action?, duration?})`, `toast.promise(p, {loading, success, error})`, `toast.dismiss(id?)`. Same `id` morphs a toast in place. `<Toaster/>` is mounted in the root |
| `skeleton` | `Skeleton` (`className` sets size); mirror the real layout |
| `empty-state` | `EmptyState` `{title (<=6 words), description? (<=10), action? (one), art?: inbox\|chart\|done}` |
| `stat-strip` | `StatStrip` (unboxed `<dl>`) with `Stat` `{label, value, detail?, hint?, href?}`; put `n = ...` in `detail` for accuracy |
| `table` | `Table` `{sticky?}`, `TableHeader/Body/Row/Head/Cell`; `sticky` pins header cells to the page scroller (table then clips instead of scrolling sideways) |
| `progress` | `Progress` `{value 0..100, label}` |
| `kbd` | `Kbd` |
| `code-block` | `CodeBlock` `{code, filename?, lineNumbers?}` mono + copy button. `CopyButton` (`copy-button`) `{value, label?, variant?, size?}` |
| `page-header` | `PageHeader` `{title, description? (<=8 words), actions?}` renders the page `h1` |
| `number-ticker` | `NumberTicker` `{value, locale?, format?, animateOnMount?}` rolling digits, instant under reduced motion. Use `animateOnMount={false}` for balances/counts |
| **`meter`** | `Meter` `{value: 0..1 \| null, threshold?, state?: acted\|queued\|shadow, label?, size: sm\|md}`. Threshold tick uses `--warning`; `state` defaults to acted when `value >= threshold`; `null` = unmeasured ("—"). `sm` for rows, `md` for detail. Fill and tick settle like a needle when props change |
| `step-dots` | `StepDots` `{step (1-based), total}` onboarding progress |
| `info-hint` | `InfoHint` `{children, label?, side?}` the (i) tooltip; `TitleWithHint`. Explanations go here, not in visible text |
| `load` | `Load` `{res, isEmpty?, empty?, fallback?, children(data)}` for `useApi`; `ErrorState`; `LoadMore` `{list}` for `usePaged` |
| `presence` | `FadePresence` `{show, mode}`, `SwapText` `{value, roll?}` small text transitions; `useReducedMotion` |
| `command` | cmdk parts (`CommandDialog`, `CommandItem`...). The palette is already built; you rarely need these |
| `sidebar` `separator` `avatar` `spinner` | shadcn pieces used by the shell |

Copy rules (DESIGN.md): sentence case, no em dashes, titles <= 6 words, every accuracy number shows its n.

## Shell and commands

`src/app/(app)/layout.tsx` wraps pages in `Shell` (sidebar, top bar, palette, shortcuts). Do not render your own
page chrome. Content sits in a `max-w-6xl` column; only that panel scrolls (`#content`).

`useShell()` from `@/components/shell/shell-context`: `{me, orgId, repoId, overview, reloadOverview}`.
`useMe()` is `useShell().me`. `overview` has the repo cards (Queue/Held badge counts come from it): call
`reloadOverview()` after you resolve items so the badges update.

**Add commands and shortcuts** with `useCommands` (`@/components/shell/commands`). They exist while the component
is mounted; no `useMemo` needed:

```tsx
useCommands([
  { id: "backfill", label: "Run backfill", group: "Repository", icon: Play, keywords: "measure", run: start }, // palette
  { id: "next", label: "Next item", group: "Queue", keys: "j" },                                              // `?` only: you handle the key
  { id: "accept", label: "Accept", group: "Queue", keys: "a", run: accept },                                  // palette + bound globally
])
```

`keys`: `"j"`, a sequence `"g q"`, or a chord `"mod+b"` (mod = ⌘ or Ctrl; chords are documentation only).
Commands with `run` appear in the ⌘K palette (grouped by `group`) and bind plain keys and sequences globally
(ignored while typing or with a dialog/menu open; a handler that calls `preventDefault` wins). Commands with
`keys` appear in the `?` dialog. Built in: ⌘K, `?`, ⌘B, `g o` repositories, `g q/h/t/c/v/i/f/s` repo pages,
theme, sign out, switch repo, and typing a number in the palette opens `/items/<id>`.

## Charts (Evil Charts)

Compound components: `EvilAreaChart`, `EvilBarChart`, `EvilLineChart`, `EvilComposedChart` from
`@/components/evilcharts/charts/recharts-<kind>-chart` (`<EvilAreaChart.Area/>`, `.XAxis`, `.Grid`, `.Tooltip`,
`.Legend`...). Colours come from `chartTheme` (`@/lib/chart-theme`): `chartTheme({ acted: "Auto-acted", queued:
"Queued", wrong: "Wrong" })`. A key that is a role (`acted queued shadow wrong threshold series1..5`) gets its
light/dark colour, any other key takes the next graphite series, or pass `{role, label}`. Shadow is foreground at 40%:
also draw it dashed. For a threshold line use Recharts' own `ReferenceLine` as a child with `stroke="var(--warning)"`.
Under dense lists or reduced motion pass `animationType="none"`. Every point should link to the items behind it.

```tsx
const config = chartTheme({ acted: "Auto-acted", queued: "Queued" })

<CardSection title="Confidence distribution" hint="Items per confidence bucket">
  <EvilAreaChart data={rows} config={config} xDataKey="bucket" className="aspect-video">
    <EvilAreaChart.Grid />
    <EvilAreaChart.XAxis dataKey="bucket" />
    <EvilAreaChart.Tooltip />
    <EvilAreaChart.Area dataKey="queued" />
    <EvilAreaChart.Area dataKey="acted" />
    <ReferenceLine x={threshold} stroke="var(--warning)" strokeWidth={2} />
  </EvilAreaChart>
</CardSection>
```

```tsx
<Meter value={s.confidence} threshold={s.threshold} />                      {/* row */}
<Meter value={0.87} threshold={0.8} size="md" label="Duplicate of #123" />  {/* detail */}
<Meter value={null} />                                                      {/* not measured */}
```
