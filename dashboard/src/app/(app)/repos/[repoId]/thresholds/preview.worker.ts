// Threshold what-if maths, off the main thread so the slider never stutters.
// "load" sorts the points once, builds prefix sums and the distribution; each "query" is then a binary search.
import type { Bin } from "@/components/measure/threshold-chart";

type Pt = { confidence: number; correct: boolean | null };
export type In = { op: "load"; points: Pt[] } | { op: "query"; t: number };
export type Counts = { t: number; n: number; acted: number; queued: number; wrong: number; unmeasured: number };
export type Out = { op: "bins"; bins: Bin[] } | ({ op: "counts" } & Counts);

const BINS = 25; // 2-point buckets over [0.5, 1]; lower confidences clamp into the first
let conf: number[] = [], wrong: number[] = [], unk: number[] = [];
const ctx = self as unknown as { onmessage: (e: MessageEvent<In>) => void; postMessage: (m: Out) => void };

ctx.onmessage = (e) => {
  const m = e.data;
  if (m.op === "load") {
    const pts = [...m.points].sort((a, b) => a.confidence - b.confidence);
    const rows = Array.from({ length: BINS }, (_, i) => ({ x: 0.5 + ((i + 0.5) * 0.5) / BINS, wrong: 0, correct: 0, unlabeled: 0 }));
    wrong = [0];
    unk = [0];
    for (const p of pts) {
      wrong.push(wrong.at(-1)! + (p.correct === false ? 1 : 0));
      unk.push(unk.at(-1)! + (p.correct === null ? 1 : 0));
      const b = rows[Math.min(BINS - 1, Math.max(0, Math.floor((p.confidence - 0.5) * 2 * BINS)))];
      if (p.correct === null) b.unlabeled++;
      else if (p.correct) b.correct++;
      else b.wrong++;
    }
    conf = pts.map((p) => p.confidence);
    // The edge anchors extend the first/last bucket so the area spans the whole axis.
    ctx.postMessage({ op: "bins", bins: [{ ...rows[0], x: 0.5 }, ...rows, { ...rows[BINS - 1], x: 1 }] });
    return;
  }
  let lo = 0, hi = conf.length; // first index with confidence >= t
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (conf[mid] >= m.t) hi = mid;
    else lo = mid + 1;
  }
  const n = conf.length;
  ctx.postMessage({ op: "counts", t: m.t, n, acted: n - lo, queued: lo, wrong: wrong[n] - wrong[lo], unmeasured: unk[n] - unk[lo] });
};
