"use client";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { NumberTicker } from "@/components/ui/number-ticker";
import { Skeleton } from "@/components/ui/skeleton";
import { Stat, StatStrip } from "@/components/ui/stat-strip";
import { pct, repoPath } from "@/lib/fmt";
import type { Repo, RepoCard } from "@/lib/types";
import { labelled } from "./use-repo-details";

const count = (n: number) => <NumberTicker value={n} locale animateOnMount={false} />;
const big = (v: React.ReactNode) => <span className="text-4xl leading-10">{v}</span>; // the two readings to act on

/** Org-level readings summed from the repo cards. The queue and measured accuracy lead; accuracy is weighted by n once repo details are in. */
export function OrgStats({ repos, details }: { repos: RepoCard[]; details?: Record<number, Repo> }) {
  const sum = (f: (r: RepoCard) => number) => repos.reduce((a, r) => a + f(r), 0);
  const trend = (k: "acted" | "queued") => sum((r) => r.trend.reduce((a, d) => a + d[k], 0));
  const acted = trend("acted");
  const decided = acted + trend("queued");
  const top = (k: "queued_open" | "held_open") => repos.reduce((a, r) => (r[k] > a[k] ? r : a), repos[0]);

  const measured = repos.filter((r) => r.accuracy !== null);
  const weights = measured.map((r) => (details?.[r.id] ? labelled(details[r.id]) : 0));
  const n = weights.reduce((a, w) => a + w, 0);
  const accuracy = n > 0 ? measured.reduce((a, r, i) => a + (r.accuracy ?? 0) * weights[i], 0) / n : measured.length ? measured.reduce((a, r) => a + (r.accuracy ?? 0), 0) / measured.length : null;

  const queued = sum((r) => r.queued_open);
  const held = sum((r) => r.held_open);
  const busiest = top("queued_open");
  return (
    <StatStrip className="lg:grid-cols-[1.5fr_1.5fr_1fr_1fr_1fr] max-sm:[&>*:last-child]:col-span-2">
      <Stat
        label="In queue"
        value={big(count(queued))}
        detail={
          queued ? (
            <Link href={repoPath(busiest.id)} className="group/review -my-1 inline-flex max-w-full items-center gap-1 rounded-md py-1 text-[13px] link-grow focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">
              <span className="shrink-0 font-medium whitespace-nowrap text-foreground">Review {busiest.queued_open}</span>
              <span className="min-w-0 truncate">in {busiest.full_name}</span>
              <ArrowRight aria-hidden className="size-3.5 shrink-0 text-foreground motion-safe:transition-[translate] motion-safe:duration-150 motion-safe:ease-settle group-hover/review:translate-x-0.5" />
            </Link>
          ) : (
            "nothing waiting"
          )
        }
      />
      <Stat
        label="Measured accuracy"
        value={big(measured.length === 0 ? "–" : details ? pct(accuracy) : <Skeleton className="h-10 w-20" />)}
        detail={measured.length === 0 ? "not measured yet" : details ? (n > 0 ? `n=${n.toLocaleString()}, ${measured.length} of ${repos.length} repos` : `mean of ${measured.length} repos, n unknown`) : "…"}
        hint="Agreement with maintainers' own decisions and backfilled history. Backfilled accuracy is an upper bound."
      />
      <Stat
        label="Auto-acted"
        value={decided ? pct(acted / decided) : "–"}
        detail={decided ? `${acted.toLocaleString()} of ${decided.toLocaleString()} decisions` : "no decisions yet"}
        hint="Decisions Jev acted on without a human, out of those acted on or queued. Shadow decisions are excluded."
      />
      <Stat label="Held" value={count(held)} detail={held ? `most in ${top("held_open").full_name}` : "nothing held"} href={held ? repoPath(top("held_open").id, "held") : undefined} />
      <Stat label="Items" value={count(sum((r) => r.items_30d))} detail={`last 30 days, ${repos.length} ${repos.length === 1 ? "repo" : "repos"}`} />
    </StatStrip>
  );
}
