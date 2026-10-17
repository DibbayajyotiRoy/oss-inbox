"use client";
import { useEffect, useRef, useState } from "react";
import type { Bin } from "@/components/measure/threshold-chart";
import type { Preview } from "@/lib/types";
import { useApi } from "@/lib/use-api";
import type { Counts, In, Out } from "./preview.worker";

/**
 * One question's history, fetched once and summed in a Web Worker: `counts` follows `t` without ever
 * blocking the slider (a query is a binary search over prefix sums). Remount per question (key) to reset.
 */
export function usePreview(repoId: number, qid: string, t: number) {
  const res = useApi<Preview>(`/api/repos/${repoId}/preview?question_id=${encodeURIComponent(qid)}`);
  const [out, setOut] = useState<{ bins?: Bin[]; counts?: Counts }>({});
  const worker = useRef<Worker | null>(null);
  const points = res.data?.points;

  useEffect(() => {
    if (!points?.length) return;
    const w = new Worker(new URL("./preview.worker.ts", import.meta.url));
    w.onmessage = (e: MessageEvent<Out>) => setOut((s) => (e.data.op === "bins" ? { ...s, bins: e.data.bins } : { ...s, counts: e.data }));
    w.postMessage({ op: "load", points } satisfies In);
    worker.current = w;
    return () => {
      w.terminate();
      worker.current = null;
    };
  }, [points]);
  useEffect(() => {
    worker.current?.postMessage({ op: "query", t } satisfies In);
  }, [points, t]);

  return { res, empty: points?.length === 0, bins: out.bins, counts: out.counts };
}
