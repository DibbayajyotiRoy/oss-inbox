# Components

The design system is in `src/components/ui/*` (shadcn new-york + Radix, restyled to DESIGN.md), the app frame in
`src/components/shell/*`, charts in `src/components/evilcharts/*`. Import from the file, never from a barrel:
`import { Button } from "@/components/ui/button"`. Tokens live in `src/app/globals.css`; never hard-code hex
(the one exception is `src/lib/chart-theme.ts`). Utilities: `ease-settle` (the one easing), `ease-needle`
(2% overshoot spring, use with `duration-250`), Tailwind's `tabular-nums` on every number. `muted` is a surface,
text is `text-muted-foreground`. Types live in one file, `@/lib/types` (API shapes, `Backfill`, `FEATURES`, `NEED`, `atLeast`).

## Primitives (`@/components/ui/<file>`)

| File | Exports and key props |
|---|---|
| `button` | `Button` variant `primary\|secondary\|outline\|ghost\|destructive\|link`, size `sm\|md\|lg\|icon\|icon-sm`, `loading`, `asChild` (wrap `Link`) |
| `card` | `Card`, `CardHeader/Title/Description/Action/Content/Footer`; **`CardSection`** `{title, description?, hint?, action?, footer?}` is the usual card |
| `badge` | `Badge` variant `secondary\|default\|outline\|success\|warning\|info\|destructive`. Counts, roles, modes only |
| `status` | `Status` `{tone: success\|danger\|warning\|progress\|waiting\|neutral, icon?}`: icon + text, never colour alone. Use for states |
| `input` `label` | shadcn; set `aria-invalid` for errors |
| `field` | `Field` `{label, htmlFor, hint?, error?, hintPlacement?: below\|inline}`; give the control `id={htmlFor}` |
| `select` | `Select` is a drop-in for native `<select>` (`<option>` children, `value`, `onChange` or `onValueChange`, `placeholder`); parts `SelectRoot/Trigger/Content/Item...` for custom |
| `checkbox` | `Checkbox` native input look: `checked`/`defaultChecked`, `onChange` or `onCheckedChange(bool)` |
| `tabs` | `Tabs` `{items: {id, label, icon?}[], value, onValueChange, variant: line\|segmented}`. Controlled, you render the panel. Sliding pill + underline (`line`) or sliding fill (`segmented`) |
| `dialog` | `Dialog` `{open, onOpenChange, title, description?, footer?, className}` + children as body. Parts: `DialogRoot/Trigger/Content/Header/Footer/Title/Description` |
| `sheet` | shadcn `Sheet`, `SheetTrigger/Content(side)/Header/Title/Description/Footer/Close` |
| `dropdown-menu` | shadcn `DropdownMenu*` |
| `tooltip` | `Tooltip`, `TooltipTrigger`, `TooltipContent` (inverted). `TooltipProvider` is already in the root |
| `toaster` | `toast("Saved")`, `toast.success/error/info/loading(title, {id?, description?, action?, duration?})`, `toast.promise(p, {loading, success, error})`, `toast.dismiss(id?)`. Same `id` morphs a toast in place. `<Toaster/>` is mounted in the root |
| `skeleton` | `Skeleton` (`className` sets size); mirror the real layout. **`Busy`** `{label?, className}` wraps a whole loading layout (`role=status`, announced once as "Loading") |
| `notice` | `Notice` `{tone: info\|warning\|destructive, title, children?, action?}`: the one callout (also what `ErrorState` renders). Destructive is announced as an alert |
| `empty-state` | `EmptyState` `{title (<=6 words), description? (<=10), action? (one), art?: inbox\|chart\|done}` |
| `stat-strip` | `StatStrip` (unboxed `<dl>`) with `Stat` `{label, value, detail?, hint?, href?}`; put `n = ...` in `detail` for accuracy |
| `table` | `Table` `{sticky?}`, `TableHeader/Body/Row/Head/Cell`; `sticky` pins header cells to the page scroller (table then clips instead of scrolling sideways) |
| **`data-table`** | `DataTable` `{columns: {key, header, cell?, align?, width?, className?, cellClassName?}[], rows, rowKey, label, storageKey?, defaultRows = 10, onRowClick?, rowHref?, selected?, empty?, className?}`: **the one table for every list of rows** (raw `Table` parts only for layout tables). Shows at most N rows, then the body scrolls under a sticky header; the footer "Rows 5 / 10 / 25 / 50 / All" + "Showing N of M" is the user's choice, remembered per `storageKey` (hidden at <= 5 rows). Box height is measured from the first N rows, so it never jumps. Below sm it scrolls sideways with a fade edge. Client components only. The header paints `bg-card`: on a bare page add `className="[&_th]:bg-background"`. `rowHref` makes the first cell a real link and the row clickable (keep other links out of that cell); `onRowClick` also gets Enter/Space; `selected(row)` fills the current row; `cellClassName` styles cells only (`className` hits header and cells). Not for expandable accordions, matrices or virtualized lists |
| **`section-nav`** | `SectionNav` wraps a long page's `Section` `{id, label}` blocks; sections are discovered from the DOM, so ones that mount after a fetch join the nav. xl+: sticky right rail with the section being read marked (`aria-current="location"`); below xl: sticky "On this page" menu. Click smooth-scrolls (instant under reduced motion), sets `#id`, focuses the heading. Spy runs on `#content`. Needs 2+ sections, else hidden. Put it below the `PageHeader` |
| `progress` | `Progress` `{value 0..100, label}` |
| `kbd` | `Kbd` |
| `code-block` | `CodeBlock` `{code, filename?, lineNumbers?}` mono + copy button. `CopyButton` (`copy-button`) `{value, label?, variant?, size?}` |
| `page-header` | `PageHeader` `{title, description? (<=8 words), actions?}` renders the page `h1` |
| `number-ticker` | `NumberTicker` `{value, locale?, format?, animateOnMount?}` rolling digits, instant under reduced motion. Use `animateOnMount={false}` for balances/counts |
| **`meter`** | `Meter` `{value: 0..1 \| null, threshold?, state?: acted\|queued\|shadow, label?, size: sm\|md}`. Threshold tick uses `--warning`; `state` defaults to acted when `value >= threshold`; `null` = unmeasured ("–"). `sm` for rows, `md` for detail. `hideLabel` keeps `label` as the accessible name without printing it; `valueText` replaces the printed reading and what is announced (`"94% · n=212"`). Fill and tick settle like a needle when props change |
| **`mode-control`** | `ModeControl` `{value: Mode, onChange, label, busy?, disabled?: Partial<Record<Mode, reason>>}`: the one off / shadow / auto control (settings and onboarding). A `disabled` reason shows in a tooltip and the option stays focusable. `MODE_VARIANT` is the Badge variant per mode |
| `step-dots` | `StepDots` `{step (1-based), total}` onboarding progress |
| `info-hint` | `InfoHint` `{children, label?, side?}` the (i) tooltip; `TitleWithHint`. Explanations go here, not in visible text |
| `load` | `Load` `{res, isEmpty?, empty?, fallback?, errorTitle?, children(data)}` for `useApi` (pass `errorTitle` when it is the whole page, so the error keeps an h1); `ErrorState`; `LoadMore` `{list}` for `usePaged` |
| `presence` | `FadePresence` `{show, mode}`, `SwapText` `{value, roll?}` small text transitions; `useReducedMotion` |
| `command` | cmdk parts (`CommandDialog`, `CommandItem`...). The palette is already built; you rarely need these |
| `sidebar` `separator` `avatar` `spinner` | shadcn pieces used by the shell |

Copy rules (DESIGN.md): sentence case, no em dashes (a missing value prints "–"), titles <= 6 words, every accuracy number
shows its n as `n=212`. Every page renders one `PageHeader` (the only h1), including its error state. Loading, empty and error
states are always `Busy` + `Skeleton`, `EmptyState` and `ErrorState`.

## Hover roles

One treatment per role, 150ms `ease-settle`, only on pointers that hover. Use the primitive; do not hand-roll a hover per screen.

| Role | Treatment | Where it lives |
|---|---|---|
| Button | fill deepens + 1px lift (press sinks to 98%) | `Button` (every variant except `link` and the icon sizes) |
| Icon button, segment, row | a pill fades and grows in behind the content | `hover-pill` utility (`Button` icon sizes, `InfoHint`, `Tabs`, `ModeControl`, sidebar buttons, list rows). Needs a positioned element; `--pill` is its colour, `--pill-inset` grows it, `--pill-from: 1` = fade only |
| Chip (a `Badge` that is a link) | lifts 1px | `Badge` |
| Text link | underline draws in from the left; an `underline` link thickens instead | `link-grow` utility (`Button variant="link"`) |

## Libraries (`@/lib/*`)

- First-paint data: wrap a layout or page in `<Preloaded paths={[...]}>` (`@/lib/server-api`, server only; forwards the visitor's cookie to `API_URL`).
  Every `useApi`/`usePaged` with a listed path then starts from that data in the HTML (SSR + hydration only; later mounts fetch fresh), so nothing
  waits on hydration plus a request. A segment `layout.tsx` with `params` is the cheapest place (the page stays a client component). Paths must match
  the client's exactly. `preload(path)` is the raw call (a 401 redirects to `/login`; any other failure is `undefined` and the client fetches).
- `useScrollable<T>(label)` (`use-scrollable`): spread on any `overflow-auto` container; it becomes a labelled, focusable region only while it overflows, so keyboards can scroll it (`Table` and `Dialog` bodies already do).
- `api<T>(path, {method?, body?})` throws `ApiError {status, detail}`. `detail` is the `{detail}` message, or the short plain
  text body, or `Request failed (HTTP 500)` for HTML / empty error pages. A 401 sends the browser to `/login`.
- `useApi`, `usePaged`, `useAction` (`use-api`). `fmt`: `pct`, `fixed`, `when` (absolute), `ago` (relative: put `when(iso)` in the
  `title`), `age(hours)` (a queue wait), `repoPath`, `issueUrl`.
- `useModeEdits(repo)` (`use-mode-edits`): `{mode(f), pick(f, mode), edits, out, busy, discard}`. Each pick POSTs `/features` with the
  working `yaml`, so edits chain into one file (`out: {yaml, edit_url, errors}`) for the user to commit. Use it with `ModeControl`.

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
Commands with `run` appear in the ⌘K palette (grouped by `group`; the current screen's groups come first, above the shell's Go to, Repositories and Preferences) and bind plain keys and sequences globally
(ignored while typing or with a dialog/menu open; a handler that calls `preventDefault` wins). Commands with
`keys` appear in the `?` dialog. Built in: ⌘K, `?`, ⌘B, `g o` repositories, `g q/h/t/c/v/i/f/s` repo pages,
theme, sign out, switch repo, and typing a number in the palette opens `/items/<id>`.

## Charts (Evil Charts)

Compound components: `EvilAreaChart`, `EvilBarChart`, `EvilComposedChart` from
`@/components/evilcharts/charts/recharts-<kind>-chart` (`<EvilAreaChart.Area/>`, `.XAxis`, `.Grid`, `.Tooltip`,
`.Legend`...). Colours come from `chartTheme` (`@/lib/chart-theme`): `chartTheme({ acted: "Auto-acted", queued:
"Queued", wrong: "Wrong" })`. A key that is a role (`acted queued shadow wrong threshold series1..5`) gets its
light/dark colour, any other key takes the next graphite series, or pass `{role, label}`. Shadow is foreground at 40%:
also draw it dashed. For a threshold line use Recharts' own `ReferenceLine` as a child with `stroke="var(--warning)"`.
Under dense lists or reduced motion pass `animationType="none"`. Every point should link to the items behind it.
`chartTheme` keeps the keys you pass (`Record<K, ...>`), so Evil Charts checks them against the data rows without casts. The Evil
legend wraps on narrow charts by itself.

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

```tsx
<DataTable
  label="Audit log" storageKey="audit" rows={rows} rowKey={(r) => r.id}
  rowHref={(r) => `/items/${r.id}`}                       // optional; or onRowClick={(r) => ...}
  columns={[
    { key: "actor", header: "Actor" },                    // default cell: row.actor, "–" when empty
    { key: "action", header: "Action", cell: (r) => <code>{r.action}</code> },
    { key: "target", header: "Target", className: "max-sm:hidden" },
    { key: "at", header: "When", align: "right", cell: (r) => when(r.at) },
  ]}
/>

<PageHeader title="Settings" />
<SectionNav>
  <div className="flex flex-col gap-10">
    <Section id="labels" label="Labels"><CardSection title="Labels">...</CardSection></Section>
    <Section id="tokens" label="Tokens"><CardSection title="Tokens">...</CardSection></Section>
  </div>
</SectionNav>
```
