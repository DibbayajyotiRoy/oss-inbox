"use client";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { Repo } from "@/lib/types";

/** Labelled decisions behind a repo's accuracy number (the n of "91% n = 412"). */
export const labelled = (r: Repo) => r.questions.reduce((s, q) => s + q.n, 0);

const NONE: Record<number, Repo> = {};

/**
 * Detail (feature modes, question n) for the given repos, fetched in parallel. The overview card has neither.
 * `undefined` while loading; a repo whose request failed is absent from the map.
 */
export function useRepoDetails(ids: number[]) {
  const key = ids.join(",");
  const [res, setRes] = useState<{ key: string; byId: Record<number, Repo> }>();
  useEffect(() => {
    if (!key) return;
    let live = true;
    Promise.allSettled(key.split(",").map((id) => api<Repo>(`/api/repos/${id}`))).then((rs) => {
      if (live) setRes({ key, byId: Object.fromEntries(rs.flatMap((r) => (r.status === "fulfilled" ? [[r.value.id, r.value]] : []))) });
    });
    return () => {
      live = false;
    };
  }, [key]);
  return key === "" ? NONE : res?.key === key ? res.byId : undefined;
}
