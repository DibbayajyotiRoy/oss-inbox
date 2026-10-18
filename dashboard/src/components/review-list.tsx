"use client";
import { useVirtualizer } from "@tanstack/react-virtual";
import { ArrowDown, ArrowUp, Check, ExternalLink, Undo2, X } from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Preview, PreviewSkeleton, optionsOf, type Act } from "@/components/review/preview";
import { ROW_H, Row, RowSkeleton, featureName, itemRef } from "@/components/review/row";
import { useCommands } from "@/components/shell/commands";
import { useShell } from "@/components/shell/shell-context";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState, LoadMore } from "@/components/ui/load";
import { PageHeader } from "@/components/ui/page-header";
import { SwapText, useReducedMotion } from "@/components/ui/presence";
import { Select } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Tabs } from "@/components/ui/tabs";
import { toast } from "@/components/ui/toaster";
import { api, errText } from "@/lib/api";
import type { QueueEntry, Suggestion } from "@/lib/types";
import { usePaged } from "@/lib/use-api";
import { Busy } from "@/components/ui/skeleton";

const ALL = "all";
const UNDO_MS = 5000;
const VERB: Record<Act, string> = { accept: "Accepted", dismiss: "Dismissed", release: "Released" };
const wide = () => matchMedia("(min-width: 1024px)").matches;

type Cursor = { id: number; i: number }; // focused entry; `i` is where it sat, so removing it focuses its neighbour

/** Where you were (filter and focused row) survives opening an item and coming back. */
const recall = (key: string): { feature?: string; cursor?: Cursor } => {
  try {
    return JSON.parse(sessionStorage.getItem(key) ?? "{}");
  } catch {
    return {};
  }
};

/** List left, preview right (one column on phones). Fills the scroll panel below whatever sits above it, so only the list scrolls. */
function Split({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    const root = el?.closest<HTMLElement>("[data-scroll-root]");
    if (!el || !root?.firstElementChild) return;
    const fit = () => {
      el.style.height = "";
      const top = el.getBoundingClientRect().top - root.getBoundingClientRect().top + root.scrollTop;
      el.style.height = `${Math.max(matchMedia("(min-width: 1024px)").matches ? 360 : 280, root.clientHeight - top - 32)}px`; // 32 = the panel's bottom padding
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(root);
    ro.observe(root.firstElementChild);
    return () => ro.disconnect();
  }, []);
  return (
    <div ref={ref} className="grid grid-rows-[minmax(0,1fr)] gap-4 lg:grid-cols-[minmax(20rem,26rem)_minmax(0,1fr)]">
      {children}
    </div>
  );
}

/**
 * The review queue and the held list: virtualized list left, focused item right (a bottom sheet on phones).
 * Keys are registered with useCommands (⌘K and `?` list them); digits, brackets, arrows and Enter are handled here.
 * Dismiss is optimistic and committed after UNDO_MS, so Undo is a local restore (there is no "reopen" endpoint).
 * Accept and release commit at once; any failure puts the row back.
 */
export function ReviewList({ bucket }: { bucket: "review" | "held" }) {
  const repoId = Number(useParams<{ repoId: string }>().repoId);
  const router = useRouter();
  const { reloadOverview } = useShell();
  const reduced = useReducedMotion();
  const held = bucket === "held";
  const group = held ? "Held" : "Queue";
  const key = `jev:review:${repoId}:${bucket}`;
  const list = usePaged<QueueEntry>(`/api/repos/${repoId}/queue?bucket=${bucket}&limit=100`);

  const [gone, setGone] = useState<ReadonlySet<number>>(new Set()); // optimistically resolved
  const [feature, setFeature] = useState(() => recall(key).feature ?? ALL);
  const [cursor, setCursor] = useState<Cursor>(() => recall(key).cursor ?? { id: 0, i: 0 });
  const [sug, setSug] = useState<Record<number, number>>({}); // entry id -> active suggestion
  const [picks, setPicks] = useState<Record<number, string>>({}); // decision id -> chosen answer
  const [sheet, setSheet] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const pending = useRef(new Map<number, { timer: number; commit: () => void; toast: string }>());
  const settled = useRef(false);

  const live = useMemo(
    () => (list.data ?? []).filter((e) => !gone.has(e.id)).sort((a, b) => b.age_hours - a.age_hours),
    [list.data, gone],
  );
  const counts = useMemo(() => new Map([...Map.groupBy(live, (e) => e.feature)].sort(([a], [b]) => a.localeCompare(b))), [live]); // stable tab order
  const active = counts.has(feature) ? feature : ALL;
  const rows = useMemo(() => (active === ALL ? live : (counts.get(active) ?? [])), [live, counts, active]);
  const at = rows.findIndex((e) => e.id === cursor.id);
  const f = rows.length ? (at >= 0 ? at : Math.min(cursor.i, rows.length - 1)) : -1;
  const cur: QueueEntry | undefined = rows[f];
  const si = cur ? (sug[cur.id] ?? 0) : 0;

  // TanStack Virtual returns un-memoizable functions; fine here because React Compiler is not enabled.
  // eslint-disable-next-line react-hooks/incompatible-library
  const virt = useVirtualizer({
    count: rows.length,
    getScrollElement: () => box.current,
    estimateSize: () => ROW_H,
    overscan: 8,
    getItemKey: (i) => rows[i]?.id ?? i,
  });

  useEffect(() => {
    if (f >= 0) virt.scrollToIndex(f, { align: "auto", behavior: settled.current && !reduced ? "smooth" : "auto" });
    settled.current = true;
  }, [f, virt, reduced]);
  useEffect(() => {
    try {
      sessionStorage.setItem(key, JSON.stringify({ feature, cursor }));
      sessionStorage.setItem("jev:list", location.pathname); // where Esc on an item page returns to
    } catch {}
  }, [key, feature, cursor]);
  const { more, loadMore } = list;
  useEffect(() => {
    if (more && f >= rows.length - 5) loadMore(); // near the end (or everything loaded is resolved): fetch the next page
  }, [more, loadMore, f, rows.length]);
  useEffect(() => {
    const p = pending.current;
    return () => p.forEach((x) => (clearTimeout(x.timer), x.commit())); // leaving the page commits dismissals still counting down
  }, []);

  const go = (i: number) => rows[i] && setCursor({ id: rows[i].id, i });
  // Functional, so a burst of key repeats before the next render still advances one row each.
  const move = (d: number) =>
    setCursor((c) => {
      const at = rows.findIndex((e) => e.id === c.id);
      const i = Math.max(0, Math.min((at >= 0 ? at : c.i) + d, rows.length - 1));
      return rows[i] ? { id: rows[i].id, i } : c;
    });
  const restore = (id: number) =>
    setGone((g) => {
      const n = new Set(g);
      n.delete(id);
      return n;
    });
  const pick = (s: Suggestion, o: string) => setPicks((p) => ({ ...p, [s.decision_id]: o }));
  const cycle = (d: number) => cur && setSug((m) => ({ ...m, [cur.id]: (si + d + cur.suggestions.length) % cur.suggestions.length }));
  const undo = (id = [...pending.current.keys()].at(-1)) => {
    const p = id === undefined ? undefined : pending.current.get(id);
    if (id === undefined || !p) return;
    clearTimeout(p.timer);
    pending.current.delete(id);
    restore(id);
    setCursor((c) => ({ ...c, id }));
    toast.dismiss(p.toast);
  };

  function resolve(e: QueueEntry, action: Act) {
    const label = itemRef(e.item);
    const answers = Object.fromEntries(e.suggestions.filter((s) => picks[s.decision_id] !== undefined).map((s) => [s.decision_id, picks[s.decision_id]]));
    const commit = () =>
      api(`/api/queue/${e.id}/resolve`, { method: "POST", body: { action, answers: action === "accept" ? answers : undefined } }).then(reloadOverview, (err) => {
        restore(e.id);
        list.reload();
        toast.error(`Could not ${action} ${label}`, { description: errText(err) });
      });
    setGone((g) => new Set(g).add(e.id));
    setSheet(false);
    if (action !== "dismiss") {
      void commit();
      return void toast.success(`${VERB[action]} ${label}`, { duration: 2500 });
    }
    const timer = window.setTimeout(() => (pending.current.delete(e.id), void commit()), UNDO_MS);
    const id = toast(`Dismissed ${label}`, { duration: UNDO_MS, action: { label: "Undo", onClick: () => undo(e.id) } });
    pending.current.set(e.id, { timer, commit, toast: id });
  }
  const act = (a: Act) => cur && resolve(cur, a);
  const openItem = () => cur && router.push(`/items/${cur.item.id}`);

  useCommands([
    { id: "review:next", label: "Next item", group, icon: ArrowDown, keys: "j", run: () => move(1) },
    { id: "review:prev", label: "Previous item", group, icon: ArrowUp, keys: "k", run: () => move(-1) },
    { id: "review:accept", label: "Accept", group, icon: Check, keys: "a", keywords: "confirm", run: () => act("accept") },
    { id: "review:dismiss", label: "Dismiss", group, icon: X, keys: "d", run: () => act("dismiss") },
    ...(held ? [{ id: "review:release", label: "Release", group, keys: "r", keywords: "unhold", run: () => act("release") }] : []),
    { id: "review:open", label: "Open item", group, keys: "e", run: openItem },
    { id: "review:github", label: "Open on GitHub", group, icon: ExternalLink, keys: "o", run: () => cur?.item.html_url && window.open(cur.item.html_url, "_blank", "noopener") },
    { id: "review:undo", label: "Undo dismiss", group, icon: Undo2, keys: "u", run: () => undo() },
    { id: "review:pick", label: "Pick that answer", group, keys: "1–9" },
    { id: "review:cycle", label: "Next suggestion", group, keys: "]" },
  ]);

  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => {
      const t = ev.target as HTMLElement | null;
      if (ev.defaultPrevented || ev.metaKey || ev.ctrlKey || ev.altKey || t?.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t?.tagName ?? "")) return;
      if (document.querySelector('[role="dialog"],[role="menu"]')) return;
      const idle = t === document.body || !!box.current?.contains(t); // nothing else owns Enter and the arrows
      const k = ev.key;
      const s = cur?.suggestions[si];
      if (/^[1-9]$/.test(k)) {
        const o = s && optionsOf(s)[Number(k) - 1];
        if (o) pick(s, o);
      } else if (k === "]" || k === "[") cycle(k === "]" ? 1 : -1);
      else if (k === "ArrowDown" && idle) move(1);
      else if (k === "ArrowUp" && idle) move(-1);
      else if (k === "Enter" && idle && cur) openItem();
      else return;
      ev.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const title = held ? "Held" : "Queue";
  const header = (filter?: ReactNode) => (
    <PageHeader
      className="mb-4"
      title={
        <>
          {title}{" "}
          {list.data && (
            <span className="ml-1 font-normal text-muted-foreground tabular-nums">
              <SwapText value={live.length} roll="down" />
              {list.more && "+"}
            </span>
          )}
        </>
      }
      description={held ? "Held as possibly sensitive. Nothing was closed." : "Oldest first. Accepting records your answer as truth."}
      actions={filter}
    />
  );

  if (list.error)
    return (
      <>
        {header()}
        <ErrorState error={list.error} retry={list.reload} />
      </>
    );

  if (list.data === undefined)
    return (
      <>
        {header()}
        <Split>
          <Busy className="min-h-0 overflow-hidden rounded-lg border">
            {Array.from({ length: 7 }, (_, i) => <RowSkeleton key={i} />)}
          </Busy>
          <div className="hidden min-h-0 lg:flex"><PreviewSkeleton /></div>
        </Split>
      </>
    );

  if (live.length === 0 && !list.more)
    return (
      <>
        {header()}
        <EmptyState
          art="done"
          title={held ? "Nothing is held" : "Queue is clear"}
          description={held ? "Possible security reports wait here for you." : "Low-confidence and shadow-mode items land here."}
        />
      </>
    );

  const tabs = [
    { id: ALL, label: <>All <span className="text-muted-foreground tabular-nums">{live.length}</span></> },
    ...[...counts].map(([id, es]) => ({ id, label: <>{featureName(id)} <span className="text-muted-foreground tabular-nums">{es.length}</span></> })),
  ];
  const filter = counts.size > 1 && (
    <>
      <Tabs variant="segmented" aria-label="Filter by feature" value={active} onValueChange={setFeature} className="max-w-full overflow-x-auto max-lg:hidden" items={tabs} />
      <Select aria-label="Filter by feature" value={active} onValueChange={setFeature} wrapperClassName="lg:hidden">
        {tabs.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
      </Select>
    </>
  );
  const preview = (className?: string) =>
    cur && <Preview e={cur} held={held} picks={picks} active={si} onPick={pick} onAct={act} className={className} />;

  return (
    <>
      {header(filter)}
      <Split>
        <div className="flex min-h-0 flex-col">
          <div
            ref={box}
            role="listbox"
            tabIndex={0}
            aria-label={`${title}. Press ? for keyboard shortcuts.`}
            aria-activedescendant={cur && `row-${cur.id}`}
            className="min-h-0 flex-1 overflow-y-auto rounded-lg border outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <div className="relative" style={{ height: virt.getTotalSize() }}>
              {virt.getVirtualItems().map((v) => (
                <Row
                  key={v.key}
                  e={rows[v.index]}
                  start={v.start}
                  focused={v.index === f}
                  onSelect={() => {
                    go(v.index);
                    if (!wide()) setSheet(true);
                  }}
                />
              ))}
            </div>
          </div>
          {(more || list.moreError) && <LoadMore list={list} />}
        </div>
        <div className="hidden min-h-0 lg:flex">{preview()}</div>
      </Split>
      <Sheet open={sheet && !!cur} onOpenChange={setSheet}>
        <SheetContent side="bottom" className="max-h-[88svh] gap-0 p-0 lg:hidden">
          <SheetHeader className="sr-only">
            <SheetTitle>{cur?.item.title}</SheetTitle>
          </SheetHeader>
          {preview("rounded-b-none border-0 [&_h2]:pr-8")}
        </SheetContent>
      </Sheet>
    </>
  );
}
