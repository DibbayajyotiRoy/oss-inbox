"use client";
import { useParams } from "next/navigation";
import { Suspense } from "react";
import { RepoHeader, RepoHeaderSkeleton, RepoProvider } from "@/components/repo";
import { Load } from "@/components/ui/load";
import { Skeleton } from "@/components/ui/skeleton";
import type { RepoFull } from "@/lib/types-settings";
import { useApi } from "@/lib/use-api";

// Navigation lives in the shell sidebar (components/shell/nav.ts); this is only the repo's identity and state.
export default function RepoLayout({ children }: LayoutProps<"/repos/[repoId]">) {
  const { repoId } = useParams<{ repoId: string }>();
  const res = useApi<RepoFull>(`/api/repos/${repoId}`);
  return (
    <Load res={res} fallback={<RepoHeaderSkeleton />}>
      {(repo) => (
        <RepoProvider value={{ repo, reload: res.reload }}>
          <RepoHeader repo={repo} />
          <Suspense fallback={<Skeleton role="status" aria-label="Loading" className="h-64 w-full" />}>{children}</Suspense>
        </RepoProvider>
      )}
    </Load>
  );
}
