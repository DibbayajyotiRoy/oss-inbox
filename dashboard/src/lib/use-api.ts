"use client";
import { useEffect, useState } from "react";
import { api, ApiError } from "./api";
import type { Page } from "./types";

export type Res<T> = { data?: T; error?: ApiError | Error; loading: boolean; reload: () => void };

/** GET `path` (null = skip). A path change shows loading (never another path's data); reload() keeps old data while refetching. */
export function useApi<T>(path: string | null): Res<T> {
  const [tick, setTick] = useState(0);
  const key = path === null ? null : `${tick}:${path}`;
  const [res, setRes] = useState<{ key: string; path: string; data?: T; error?: Error }>();
  useEffect(() => {
    if (key === null || path === null) return;
    let live = true;
    api<T>(path).then(
      (data) => live && setRes({ key, path, data }),
      (error) => live && setRes({ key, path, error }),
    );
    return () => {
      live = false;
    };
  }, [key, path]);
  // Same path, older tick = a reload: keep showing the previous data (children must not unmount).
  const same = res && res.path === path ? res : undefined;
  const fresh = same !== undefined && same.key === key;
  return { data: same?.data, error: fresh ? same.error : undefined, loading: key !== null && !fresh, reload: () => setTick((t) => t + 1) };
}

export type Paged<T> = Res<T[]> & { more: boolean; loadMore: () => void; loadingMore: boolean; moreError?: Error };

/** Cursor-paginated GET. `path` may already contain a query string. Extra pages reset when the first page reloads. */
export function usePaged<T>(path: string): Paged<T> {
  const first = useApi<Page<T>>(path);
  const base = first.data;
  const [ext, setExt] = useState<{ base: Page<T>; items: T[]; next: string | null }>();
  const [busy, setBusy] = useState(false);
  const [moreError, setMoreError] = useState<Error>();
  const cur = ext && ext.base === base ? ext : undefined;
  const next = cur ? cur.next : (base?.next_cursor ?? null);
  const loadMore = () => {
    if (!base || !next || busy) return;
    setBusy(true);
    setMoreError(undefined);
    api<Page<T>>(`${path}${path.includes("?") ? "&" : "?"}cursor=${encodeURIComponent(next)}`)
      .then((p) => setExt({ base, items: [...(cur?.items ?? []), ...p.items], next: p.next_cursor }))
      .catch((e) => setMoreError(e))
      .finally(() => setBusy(false));
  };
  return {
    data: base && [...base.items, ...(cur?.items ?? [])],
    error: first.error, loading: first.loading, reload: first.reload,
    more: next !== null, loadMore, loadingMore: busy, moreError,
  };
}

/** Tracks one mutation's busy/error state. `run(fn)` resolves to fn's result, or undefined if it threw (error is kept in state, and passed to `onError`). */
export function useAction(onError?: (e: Error) => void) {
  const [s, setS] = useState<{ busy: boolean; error?: Error }>({ busy: false });
  const run = async <T>(fn: () => Promise<T>): Promise<T | undefined> => {
    setS({ busy: true });
    try {
      const r = await fn();
      setS({ busy: false });
      return r;
    } catch (e) {
      const error = e instanceof Error ? e : new Error(String(e));
      setS({ busy: false, error });
      onError?.(error);
    }
  };
  return { ...s, run };
}
