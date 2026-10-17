"use client";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Trend, TrendLegend } from "@/components/charts";
import { Badge, Bar, Empty, Load, Stat } from "@/components/ui";
import { pct, repoPath } from "@/lib/fmt";
import type { Overview } from "@/lib/types";
import { useApi } from "@/lib/use-api";

export default function OrgOverview() {
  const { orgId } = useParams<{ orgId: string }>();
  const res = useApi<Overview>(`/api/orgs/${orgId}/overview`);
  return (
    <Load
      res={res}
      isEmpty={(d) => d.repos.length === 0}
      empty={
        <Empty title="No repositories yet">
          Repositories appear here once the GitHub App is installed on them. Add repositories to the installation in your GitHub
          settings, then reload.
        </Empty>
      }
    >
      {(d) => (
        <>
          <h1 className="mb-1 text-lg font-semibold">{d.org.login}</h1>
          <p className="mb-3 text-muted">Last 30 days. Accuracy is measured against maintainers&apos; own decisions and backfilled history.</p>
          <ul className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            {d.repos.map((r) => (
              <li key={r.id} className={`card relative hover:border-muted ${r.enabled ? "" : "border-dashed bg-surface"}`}>
                <div className="flex flex-wrap items-center gap-1.5">
                  <h2 className="font-semibold">
                    <Link href={repoPath(r.id)} className="text-fg after:absolute after:inset-0">{r.full_name}</Link>
                  </h2>
                  {r.private && <Badge title="Private repository">Private</Badge>}
                  {!r.enabled && <Badge tone="warn" title="Jev is not processing events for this repository">Disabled</Badge>}
                </div>
                {!r.enabled && (
                  <p className="mt-1 text-xs text-muted">
                    {r.private ? "Private repos stay off until an admin acknowledges that content goes to the decision backend." : "Not enabled."}
                  </p>
                )}
                <dl className="mt-2 grid grid-cols-3 gap-2">
                  <Stat label="Items (30d)" value={r.items_30d} />
                  <Stat label="Accuracy" value={pct(r.accuracy)} sub={r.accuracy === null ? "not measured yet" : undefined} />
                  <Stat label="Override rate" value={pct(r.override_rate)} />
                </dl>
                <div className="mt-2">
                  <div className="flex justify-between text-xs text-muted">
                    <span>Auto-acted share</span>
                    <span>{r.acted_share === null ? "no acted/queued items" : `${pct(r.acted_share)} acted · ${pct(1 - r.acted_share)} queued`}</span>
                  </div>
                  <Bar p={r.acted_share ?? 0} label={r.acted_share === null ? "—" : undefined} />
                </div>
                <div className="relative z-10 mt-2 flex gap-4">
                  <Link href={repoPath(r.id, "queue")}>{r.queued_open} in queue</Link>
                  <Link href={repoPath(r.id, "held")}>{r.held_open} held</Link>
                </div>
                <div className="mt-2">
                  <Trend data={r.trend} />
                  <TrendLegend />
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
    </Load>
  );
}
