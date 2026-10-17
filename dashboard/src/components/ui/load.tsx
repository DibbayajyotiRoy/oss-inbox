"use client"

import type { ReactNode } from "react"

import { ApiError } from "@/lib/api"
import type { Paged, Res } from "@/lib/use-api"
import { Button } from "./button"
import { Notice } from "./notice"
import { PageHeader } from "./page-header"
import { Busy, Skeleton } from "./skeleton"

export function ErrorState({ error, retry }: { error: Error; retry?: () => void }) {
  const status = error instanceof ApiError ? error.status : 0
  const hint = status === 401 ? "Redirecting to sign-in…" : status === 403 ? "You do not have access to this." : status === 404 ? "Not found." : ""
  return (
    <Notice tone="destructive" title={`Something went wrong${status ? ` (${status})` : ""}`}>
      <p className="break-words">
        {hint} {error.message}
      </p>
      {retry ? (
        <Button variant="outline" size="sm" className="mt-3" onClick={retry}>
          Retry
        </Button>
      ) : null}
    </Notice>
  )
}

/** Generic skeleton; pass `fallback` with one that mirrors the real layout. */
const GenericSkeleton = () => (
  <Busy className="flex flex-col gap-3">
    <Skeleton className="h-6 w-1/3" />
    <Skeleton className="h-24 w-full" />
    <Skeleton className="h-24 w-full" />
  </Busy>
)

/**
 * Loading / error / empty / data in one place. `empty` shows when `isEmpty(data)`; it must say what will appear and why.
 * A `Load` that is the whole page passes `errorTitle`, so the error still has the page's h1.
 */
export function Load<T>({
  res,
  isEmpty,
  empty,
  fallback,
  errorTitle,
  children,
}: {
  res: Res<T>
  isEmpty?: (data: T) => boolean
  empty?: ReactNode
  fallback?: ReactNode
  errorTitle?: string
  children: (data: T) => ReactNode
}) {
  if (res.error)
    return (
      <>
        {errorTitle ? <PageHeader title={errorTitle} /> : null}
        <ErrorState error={res.error} retry={res.reload} />
      </>
    )
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
