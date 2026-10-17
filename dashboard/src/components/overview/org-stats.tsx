"use client";
import { NumberTicker } from "@/components/ui/number-ticker";
import { Skeleton } from "@/components/ui/skeleton";
import { Stat, StatStrip } from "@/components/ui/stat-strip";
import { pct, repoPath } from "@/lib/fmt";
import type { Repo, RepoCard } from "@/lib/types";
import { labelled } from "./use-repo-details";

const count = (n: number) => <NumberTicker value={n} locale animateOnMount={false} />;

/** Org-level readings summed from the repo cards. Accuracy is weighted by n once repo details are in. */
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
  return (
    <StatStrip className="lg:grid-cols-5 max-sm:[&>*:last-child]:col-span-2">
      <Stat label="Items" value={count(sum((r) => r.items_30d))} detail={`last 30 days, ${repos.length} ${repos.length === 1 ? "repo" : "repos"}`} />
      <Stat
        label="Auto-acted"
        value={decided ? pct(acted / decided) : "—"}
        detail={decided ? `${acted.toLocaleString()} of ${decided.toLocaleString()} decisions` : "no decisions yet"}
        hint="Decisions Jev acted on without a human, out of those acted on or queued. Shadow decisions are excluded."
      />
      <Stat label="In queue" value={count(queued)} detail={queued ? `most in ${top("queued_open").full_name}` : "nothing waiting"} href={queued ? repoPath(top("queued_open").id) : undefined} />
      <Stat label="Held" value={count(held)} detail={held ? `most in ${top("held_open").full_name}` : "nothing held"} href={held ? repoPath(top("held_open").id, "held") : undefined} />
      <Stat
        label="Measured accuracy"
        value={measured.length === 0 ? "—" : details ? pct(accuracy) : <Skeleton className="mt-1 h-7 w-14" />}
        detail={measured.length === 0 ? "not measured yet" : details ? (n > 0 ? `n = ${n.toLocaleString()}, ${measured.length} of ${repos.length} repos` : `mean of ${measured.length} repos, n unknown`) : "…"}
        hint="Agreement with maintainers' own decisions and backfilled history. Backfilled accuracy is an upper bound."
      />
    </StatStrip>
  );
}
