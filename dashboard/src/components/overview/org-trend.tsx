"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { ReferenceLine } from "recharts";
import { EvilAreaChart } from "@/components/evilcharts/charts/recharts-area-chart";
import { CardSection } from "@/components/ui/card";
import { repoPath } from "@/lib/fmt";
import type { RepoCard } from "@/lib/types";
import { trendConfig } from "./repo-card";

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
                    <Link href={repoPath(r.id)} className="flex items-center justify-between gap-4 rounded-sm py-2 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">
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
      <EvilAreaChart
        data={data}
        config={trendConfig}
        stackType="stacked"
        className="-mt-3 aspect-auto h-52 cursor-pointer sm:h-64"
        chartProps={{ onClick: (s) => s.activeIndex != null && pick(Number(s.activeIndex)), margin: { top: 8, right: 4, bottom: 0, left: 0 } }}
      >
        <EvilAreaChart.Grid />
        <EvilAreaChart.XAxis dataKey="day" interval="preserveStartEnd" minTickGap={32} />
        <EvilAreaChart.YAxis allowDecimals={false} width={32} />
        <EvilAreaChart.Tooltip />
        <EvilAreaChart.Legend align="left" />
        <EvilAreaChart.Area dataKey="acted" strokeVariant="solid" />
        <EvilAreaChart.Area dataKey="queued" strokeVariant="solid" />
        <EvilAreaChart.Area dataKey="shadow" />
        {sel !== null && <ReferenceLine x={data[sel].day} stroke="var(--foreground)" strokeOpacity={0.4} strokeDasharray="3 3" />}
      </EvilAreaChart>
    </CardSection>
  );
}
