"use client"

import type { ReactNode } from "react"
import { TriangleAlert } from "lucide-react"

import { ApiError } from "@/lib/api"
import type { Paged, Res } from "@/lib/use-api"
import { Button } from "./button"
import { Skeleton } from "./skeleton"

export function ErrorState({ error, retry }: { error: Error; retry?: () => void }) {
  const status = error instanceof ApiError ? error.status : 0
  const hint = status === 401 ? "Redirecting to sign-in…" : status === 403 ? "You do not have access to this." : status === 404 ? "Not found." : ""
  return (
    <div role="alert" className="flex items-start gap-3 rounded-lg border border-destructive/40 bg-destructive/5 p-4">
      <TriangleAlert aria-hidden className="mt-0.5 size-4 shrink-0 text-destructive" />
      <div className="min-w-0 flex-1">
        <p className="font-medium text-destructive">Something went wrong{status ? ` (${status})` : ""}</p>
        <p className="mt-0.5 text-sm break-words text-muted-foreground">
          {hint} {error.message}
        </p>
        {retry ? (
          <Button variant="outline" size="sm" className="mt-3" onClick={retry}>
            Retry
          </Button>
        ) : null}
      </div>
    </div>
  )
}

/** Generic skeleton; pass `fallback` with one that mirrors the real layout. */
const GenericSkeleton = () => (
  <div role="status" aria-busy="true" className="flex flex-col gap-3">
    <Skeleton className="h-6 w-1/3" />
    <Skeleton className="h-24 w-full" />
    <Skeleton className="h-24 w-full" />
    <span className="sr-only">Loading</span>
  </div>
)

/** Loading / error / empty / data in one place. `empty` shows when `isEmpty(data)`; it must say what will appear and why. */
export function Load<T>({
  res,
  isEmpty,
  empty,
  fallback,
  children,
}: {
  res: Res<T>
  isEmpty?: (data: T) => boolean
  empty?: ReactNode
  fallback?: ReactNode
  children: (data: T) => ReactNode
}) {
  if (res.error) return <ErrorState error={res.error} retry={res.reload} />
  if (res.data === undefined) return <>{fallback ?? <GenericSkeleton />}</>
  if (isEmpty?.(res.data)) return <>{empty}</>
  return <>{children(res.data)}</>
}

/** Footer for `usePaged` lists. */
export function LoadMore({ list }: { list: Pick<Paged<unknown>, "more" | "loadMore" | "loadingMore" | "moreError"> }) {
  return (
    <div className="mt-3 text-center">
      {list.moreError ? (
        <p role="alert" className="mb-2 text-destructive">
          {list.moreError.message}
        </p>
      ) : null}
      {list.more ? (
        <Button variant="outline" size="sm" onClick={list.loadMore} loading={list.loadingMore}>
          Load more
        </Button>
      ) : null}
    </div>
  )
}
