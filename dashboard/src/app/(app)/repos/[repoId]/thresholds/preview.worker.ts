// Threshold what-if maths, off the main thread so the slider never stutters.
// "load" sorts the points once and builds prefix sums; each "query" is then a binary search.
import type { HistBin } from "@/components/charts";

type Pt = { confidence: number; correct: boolean | null };
export type In = { op: "load"; id: string; points: Pt[] } | { op: "query"; id: string; t: number };
export type Counts = { id: string; t: number; n: number; acted: number; queued: number; wrong: number; unmeasured: number; bins: HistBin[] };

const BINS = 25;
const store = new Map<string, { conf: number[]; wrong: number[]; unk: number[]; bins: HistBin[] }>();
const ctx = self as unknown as Worker;

ctx.onmessage = (e: MessageEvent<In>) => {
  const m = e.data;
  if (m.op === "load") {
    const pts = [...m.points].sort((a, b) => a.confidence - b.confidence);
    const wrong = [0], unk = [0];
    const bins: HistBin[] = Array.from({ length: BINS }, () => ({ ok: 0, bad: 0, unk: 0 }));
    for (const p of pts) {
      wrong.push(wrong.at(-1)! + (p.correct === false ? 1 : 0));
      unk.push(unk.at(-1)! + (p.correct === null ? 1 : 0));
      const b = bins[Math.min(BINS - 1, Math.max(0, Math.floor((p.confidence - 0.5) * 2 * BINS)))];
      if (p.correct === null) b.unk++;
      else if (p.correct) b.ok++;
      else b.bad++;
    }
    store.set(m.id, { conf: pts.map((p) => p.confidence), wrong, unk, bins });
    return;
  }
  const s = store.get(m.id);
  if (!s) return;
  let lo = 0, hi = s.conf.length; // first index with confidence >= t
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (s.conf[mid] >= m.t) hi = mid;
    else lo = mid + 1;
  }
  const n = s.conf.length;
  ctx.postMessage({ id: m.id, t: m.t, n, acted: n - lo, queued: lo, wrong: s.wrong[n] - s.wrong[lo], unmeasured: s.unk[n] - s.unk[lo], bins: s.bins } satisfies Counts);
};
