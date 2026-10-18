"use client";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { CardSection } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { repoPath } from "@/lib/fmt";
import type { RepoCard } from "@/lib/types";

// Recharts (~440 KB) loads after first paint into a skeleton of the chart's exact size, so nothing shifts.
const TrendChart = dynamic(() => import("./trend-chart").then((m) => m.TrendChart), { ssr: false, loading: () => <Skeleton className="-mt-3 h-52 sm:h-64" /> });

const label = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString(undefined, { month: "short", day: "numeric" });

/**
 * 30 days of acted / queued / shadow across the org's repos. Click a day: with one active repo it opens that
 * repo's queue, otherwise the repos active that day are listed under the chart, each linking to its queue.
 */
export function OrgTrend({ repos }: { repos: RepoCard[] }) {
  const router = useRouter();
  const [sel, setSel] = useState<number | null>(null);
  const data = useMemo(
    () =>
      (repos[0]?.trend ?? []).map((d, i) => {
        const sum = (k: "acted" | "queued" | "shadow") => repos.reduce((a, r) => a + (r.trend[i]?.[k] ?? 0), 0);
        return { date: d.date, day: label(d.date), acted: sum("acted"), queued: sum("queued"), shadow: sum("shadow") };
      }),
    [repos],
  );
  const active = (i: number) =>
    repos.flatMap((r) => {
      const t = r.trend[i];
      return t && t.acted + t.queued + t.shadow > 0 ? [{ r, t }] : [];
    });

  function pick(i: number) {
    const hit = active(i);
    if (hit.length === 1) router.push(repoPath(hit[0].r.id));
    else setSel(sel === i ? null : i);
  }

  const rows = sel === null ? [] : active(sel);
  return (
    <CardSection
      title="Last 30 days"
      hint="Decisions per day across all repositories. Shadow decisions were made but never acted on. Click a day to open its queue."
      footer={
        sel !== null && (
          <div className="w-full" aria-live="polite">
            <p className="mb-2 text-[13px] font-medium">{data[sel].day}</p>
            {rows.length === 0 ? (
              <p className="text-sm text-muted-foreground">No decisions on this day.</p>
            ) : (
              <ul className="divide-y text-sm">
                {rows.map(({ r, t }) => (
                  <li key={r.id}>
                    <Link href={repoPath(r.id)} className="hover-pill relative -mx-2 flex items-center justify-between gap-4 rounded-md px-2 py-2 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">
                      <span className="truncate font-medium">{r.full_name}</span>
                      <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                        {t.acted} acted · {t.queued} queued · {t.shadow} shadow
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )
      }
    >
      <TrendChart data={data} sel={sel} onPick={pick} />
    </CardSection>
  );
}
