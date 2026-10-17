"use client";
import { useVirtualizer } from "@tanstack/react-virtual";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { api, errText } from "@/lib/api";
import { age, pct } from "@/lib/fmt";
import type { QueueEntry, Suggestion } from "@/lib/types";
import { usePaged } from "@/lib/use-api";
import { useRepo } from "./repo";
import { Badge, Bar, Empty, ErrorBox, LoadMore } from "./ui";

type Action = "accept" | "dismiss" | "release";
const verb: Record<Action, string> = { accept: "Accepted", dismiss: "Dismissed", release: "Released" };

/** Options of a suggestion, most probable first. */
const optionsOf = (s: Suggestion) => {
  const o = s.options.length ? s.options : Object.keys(s.probabilities);
  return [...o].sort((a, b) => (s.probabilities[b] ?? 0) - (s.probabilities[a] ?? 0));
};

const keys: [string, string][] = [
  ["j / k", "next / previous item"],
  ["1 – 9", "pick that option of the focused suggestion"],
  ["[ / ]  or  Tab / Shift+Tab", "previous / next suggestion (Tab only while the list itself has focus)"],
  ["a", "accept (picked answers override Jev's)"],
  ["d", "dismiss (no ground truth recorded)"],
  ["r", "release (held items only)"],
  ["e or Enter", "open item detail"],
  ["?", "toggle this help"],
];

export function ReviewList({ bucket }: { bucket: "review" | "held" }) {
  const { repo, canAct } = useRepo();
  const router = useRouter();
  const list = usePaged<QueueEntry>(`/api/repos/${repo.id}/queue?bucket=${bucket}&limit=100`);
  const [gone, setGone] = useState<ReadonlySet<number>>(new Set()); // optimistically resolved entries
  const [focus, setFocus] = useState(0);
  const [sug, setSug] = useState<Record<number, number>>({}); // entry id -> focused suggestion
  const [picks, setPicks] = useState<Record<number, string>>({}); // decision id -> chosen answer
  const [msg, setMsg] = useState("");
  const [help, setHelp] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const dlg = useRef<HTMLDialogElement>(null);

  const rows = useMemo(
    () => (list.data ?? []).filter((e) => !gone.has(e.id)).sort((a, b) => b.age_hours - a.age_hours),
    [list.data, gone],
  );
  const f = Math.min(focus, rows.length - 1);
  // TanStack Virtual returns un-memoizable functions; fine here because React Compiler is not enabled.
  // eslint-disable-next-line react-hooks/incompatible-library
  const virt = useVirtualizer({
    count: rows.length,
    getScrollElement: () => box.current,
    estimateSize: () => 170,
    overscan: 6,
    getItemKey: (i) => rows[i]?.id ?? i,
  });

  useEffect(() => {
    if (f >= 0) virt.scrollToIndex(f, { align: "auto" });
  }, [f, virt]);
  useEffect(() => {
    const d = dlg.current;
    if (!d || help === d.open) return;
    if (help) d.showModal();
    else d.close();
  }, [help]);

  async function resolve(e: QueueEntry, action: Action) {
    if (!canAct) return setMsg("Read-only: resolving needs maintainer access.");
    if (action === "release" && bucket !== "held") return;
    const answers = Object.fromEntries(
      e.suggestions.filter((s) => picks[s.decision_id] !== undefined).map((s) => [s.decision_id, picks[s.decision_id]]),
    );
    const label = `${e.item.kind} ${e.item.number ? "#" + e.item.number : e.item.id}`;
    setGone((g) => new Set(g).add(e.id));
    setMsg(`${verb[action]} ${label}.`);
    try {
      await api(`/api/queue/${e.id}/resolve`, { method: "POST", body: { action, answers: action === "accept" ? answers : undefined } });
    } catch (err) {
      setGone((g) => {
        const n = new Set(g);
        n.delete(e.id);
        return n;
      });
      setMsg(`Could not ${action} ${label} (${errText(err)}). It was put back in the list.`);
    }
  }
  const pick = (s: Suggestion, o: string) => setPicks((p) => ({ ...p, [s.decision_id]: o }));
  const cycle = (e: QueueEntry, d: number) =>
    setSug((m) => ({ ...m, [e.id]: ((m[e.id] ?? 0) + d + e.suggestions.length) % e.suggestions.length }));

  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => {
      const t = ev.target as HTMLElement | null;
      if (ev.metaKey || ev.ctrlKey || ev.altKey || t?.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t?.tagName ?? "")) return;
      if (ev.key === "?") {
        setHelp((h) => !h);
        return ev.preventDefault();
      }
      if (help) return;
      const e = rows[f];
      const k = ev.key;
      const onList = document.activeElement === box.current; // Tab is only hijacked while the list itself has focus
      let handled = true;
      if (k === "j") setFocus((x) => Math.min(Math.min(x, rows.length - 1) + 1, rows.length - 1));
      else if (k === "k") setFocus((x) => Math.max(Math.min(x, rows.length - 1) - 1, 0));
      else if (!e) handled = false;
      else if (/^[1-9]$/.test(k)) {
        const s = e.suggestions[sug[e.id] ?? 0];
        const o = s && optionsOf(s)[Number(k) - 1];
        if (o) pick(s, o);
      } else if (k === "]" || (k === "Tab" && !ev.shiftKey && onList)) cycle(e, 1);
      else if (k === "[" || (k === "Tab" && ev.shiftKey && onList)) cycle(e, -1);
      else if (k === "a") void resolve(e, "accept");
      else if (k === "d") void resolve(e, "dismiss");
      else if (k === "r") void resolve(e, "release");
      else if (k === "e" || (k === "Enter" && !t?.closest("button,a,summary"))) router.push(`/items/${e.item.id}`);
      else handled = false;
      if (handled) ev.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  if (list.error) return <ErrorBox error={list.error} retry={list.reload} />;
  if (list.data === undefined) return <p className="py-8 text-center text-muted" role="status" aria-busy="true">Loading…</p>;
  if (rows.length === 0 && !list.more)
    return (
      <>
        <p role="status" aria-live="polite" className="mb-2 text-sm">{msg}</p>
        <Empty title={bucket === "held" ? "Nothing is held" : "Nothing is waiting for review"}>
          {bucket === "held"
            ? "Reports from outside your team that look security-sensitive are held here instead of being filed publicly. You will see them as soon as one is detected."
            : "Items land here when Jev's confidence is below the threshold, when a feature is in shadow mode (suggestions only), or when a question has not been measured yet. Resolved items disappear and become measured accuracy."}
        </Empty>
      </>
    );

  return (
    <>
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <p className="text-sm text-muted">
          {rows.length}{list.more ? "+" : ""} {bucket === "held" ? "held" : "to review"}, oldest first
        </p>
        <span className="flex-1" />
        <button className="btn max-sm:hidden" onClick={() => setHelp(true)}>Keyboard shortcuts <kbd>?</kbd></button>
      </div>
      <p role="status" aria-live="polite" className="mb-2 min-h-5 text-sm">{msg}</p>
      <div
        ref={box}
        tabIndex={0}
        aria-label={`${bucket === "held" ? "Held" : "Review"} list. Press ? for keyboard shortcuts.`}
        className="max-h-[calc(100dvh-17rem)] min-h-64 overflow-auto rounded-lg border border-line"
      >
        <ul className="relative" style={{ height: virt.getTotalSize() }}>
          {virt.getVirtualItems().map((v) => {
            const e = rows[v.index];
            return (
              <li key={v.key} data-index={v.index} ref={virt.measureElement} className="absolute left-0 top-0 w-full" style={{ transform: `translateY(${v.start}px)` }}>
                <Row
                  e={e} focused={v.index === f} si={sug[e.id] ?? 0} picks={picks} bucket={bucket} canAct={canAct}
                  onFocus={() => setFocus(v.index)} onPick={pick} onAct={(a) => void resolve(e, a)}
                />
              </li>
            );
          })}
        </ul>
      </div>
      <LoadMore p={list} />
      <dialog ref={dlg} onClose={() => setHelp(false)} aria-labelledby="kb-title" className="m-auto w-[min(32rem,92vw)] rounded-lg border border-line bg-bg p-4">
        <h2 id="kb-title" className="mb-2 font-semibold">Keyboard shortcuts</h2>
        <table>
          <tbody>
            {keys.map(([k, d]) => (
              <tr key={k}><td className="whitespace-nowrap"><kbd>{k}</kbd></td><td>{d}</td></tr>
            ))}
          </tbody>
        </table>
        <p className="mt-2 text-xs text-muted">On a phone, use the buttons on each item. Picking an option and then accepting records your answer as ground truth.</p>
        <button className="btn mt-3" onClick={() => setHelp(false)}>Close</button>
      </dialog>
    </>
  );
}

function Row({ e, focused, si, picks, bucket, canAct, onFocus, onPick, onAct }: {
  e: QueueEntry; focused: boolean; si: number; picks: Record<number, string>; bucket: string; canAct: boolean;
  onFocus: () => void; onPick: (s: Suggestion, o: string) => void; onAct: (a: Action) => void;
}) {
  const changed = e.suggestions.filter((s) => picks[s.decision_id] !== undefined && picks[s.decision_id] !== s.answer).length;
  return (
    <article aria-current={focused || undefined} onClick={onFocus} className={`border-b border-line p-3 ${focused ? "bg-info-soft ring-2 ring-inset ring-accent" : ""}`}>
      <div className="flex flex-wrap items-baseline gap-x-2">
        <Link href={`/items/${e.item.id}`} className="font-medium text-fg">{e.item.title}</Link>
        {e.item.html_url && <a href={e.item.html_url} target="_blank" rel="noreferrer" className="text-xs">GitHub ↗</a>}
      </div>
      <p className="text-xs text-muted">
        {e.item.kind}{e.item.number ? ` #${e.item.number}` : ""} · {e.item.author ?? "unknown author"} · waiting {age(e.age_hours)}
      </p>
      <p className="mt-1 flex flex-wrap items-center gap-1.5 text-sm"><Badge>{e.feature}</Badge>{e.reason}</p>
      {e.suggestions.map((s, i) => {
        const cur = focused && i === si;
        const chosen = picks[s.decision_id] ?? s.answer;
        return (
          <div key={s.decision_id} className={`mt-2 rounded-md border p-2 ${cur ? "border-accent" : "border-line"}`}>
            <div className="flex flex-wrap justify-between gap-x-3 text-xs text-muted">
              <span className="font-mono">{s.question_id}</span>
              <span>Jev: <b className="text-fg">{s.answer}</b> at {pct(s.confidence)} (threshold {pct(s.threshold)})</span>
            </div>
            {optionsOf(s).slice(0, cur ? 9 : 4).map((o, j) => (
              <button
                key={o} type="button" aria-pressed={o === chosen} onClick={() => onPick(s, o)}
                className="flex min-h-9 w-full items-center gap-2 rounded px-1 text-left hover:bg-surface max-sm:min-h-11"
              >
                <kbd className="max-sm:hidden">{j + 1}</kbd>
                <span aria-hidden className="w-3">{o === chosen ? "✓" : ""}</span>
                <span className={`w-28 shrink-0 truncate ${o === chosen ? "font-semibold" : ""}`}>
                  {o}{o === chosen && o !== s.answer ? " (your pick)" : ""}
                </span>
                <span className="flex-1"><Bar p={s.probabilities[o] ?? 0} tone={o === chosen ? "ok" : "info"} marker={o === s.answer ? s.threshold : undefined} /></span>
              </button>
            ))}
          </div>
        );
      })}
      <div className="mt-2 flex flex-wrap gap-2">
        <button className="btn btn-primary" disabled={!canAct} onClick={() => onAct("accept")}>Accept{changed ? ` (${changed} changed)` : ""}</button>
        <button className="btn" disabled={!canAct} onClick={() => onAct("dismiss")}>Dismiss</button>
        {bucket === "held" && <button className="btn" disabled={!canAct} onClick={() => onAct("release")}>Release</button>}
        <Link href={`/items/${e.item.id}`} className="btn">Details</Link>
      </div>
    </article>
  );
}
