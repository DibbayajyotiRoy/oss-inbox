"use client";
import Link from "next/link";
import { ArrowUpRight, CirclePause, Inbox, Lock } from "lucide-react";
import { EvilAreaChart } from "@/components/evilcharts/charts/recharts-area-chart";
import type { ChartConfig } from "@/components/evilcharts/ui/recharts-chart";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { InfoHint } from "@/components/ui/info-hint";
import { Skeleton } from "@/components/ui/skeleton";
import { Status } from "@/components/ui/status";
import { pct, repoPath } from "@/lib/fmt";
import { chartTheme } from "@/lib/chart-theme";
import type { Mode, Repo, RepoCard } from "@/lib/types";
import { cn } from "@/lib/utils";
import { labelled } from "./use-repo-details";

// chartTheme returns an open ChartConfig; the narrow key type lets Evil Charts check keys against the data rows.
export const trendConfig = chartTheme({ acted: "Auto-acted", queued: "Queued", shadow: "Shadow" }) as Record<"acted" | "queued" | "shadow", ChartConfig[string]>;

// Colour only where Jev acts on its own; shadow is quiet, off is quieter.
const MODE: Record<Mode, "success" | "secondary" | "outline"> = { auto: "success", shadow: "secondary", off: "outline" };

/** Where a card leads: the queue, or setup while the repo is off (admins only; others cannot enable it). */
export const cardHref = (r: RepoCard) => (r.enabled ? repoPath(r.id) : r.role === "admin" ? `/onboarding/${r.id}` : repoPath(r.id));

function Spark({ r }: { r: RepoCard }) {
  const sum = (k: "acted" | "queued" | "shadow") => r.trend.reduce((a, d) => a + d[k], 0);
  const empty = sum("acted") + sum("queued") + sum("shadow") === 0;
  return (
    <div role="img" aria-label={`Last ${r.trend.length} days: ${sum("acted")} auto-acted, ${sum("queued")} queued, ${sum("shadow")} shadow`} className="h-12">
      {empty ? (
        <p className="grid h-full place-items-center rounded-md border border-dashed text-xs text-muted-foreground">No activity in 30 days</p>
      ) : (
        <EvilAreaChart data={r.trend} config={trendConfig} stackType="stacked" animationType="none" className="aspect-auto h-12" chartProps={{ margin: { top: 2, right: 0, bottom: 0, left: 0 } }}>
          <EvilAreaChart.Area dataKey="acted" strokeVariant="solid" strokeWidth={1.25} />
          <EvilAreaChart.Area dataKey="queued" strokeVariant="solid" strokeWidth={1.25} />
          <EvilAreaChart.Area dataKey="shadow" strokeWidth={1.25} />
        </EvilAreaChart>
      )}
    </div>
  );
}

function Metric({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 text-lg font-semibold tracking-tight tabular-nums">{value}</dd>
      <dd className="truncate text-xs text-muted-foreground">{detail}</dd>
    </div>
  );
}

/** One enabled repository: sparkline, readings, modes and open counts. The whole card is the title's link; inner links sit above it. */
export function OrgRepoCard({ r, detail, detailsLoading }: { r: RepoCard; detail?: Repo; detailsLoading: boolean }) {
  const [owner, name] = r.full_name.split("/");
  const n = detail ? labelled(detail) : null;
  return (
    <Card className="group relative gap-4 py-5 shadow-xs motion-safe:transition-[border-color,background-color] motion-safe:duration-200 motion-safe:ease-settle focus-within:border-chart-4 hover:border-chart-4 hover:bg-[color-mix(in_oklab,var(--card)_62%,var(--accent))]">
      <div className="flex items-center justify-between gap-3 px-5">
        <h3 className="flex min-w-0 items-center gap-2 text-[15px] font-semibold">
          <Link href={cardHref(r)} className="min-w-0 truncate rounded-sm outline-none after:absolute after:inset-0 after:rounded-xl focus-visible:after:ring-2 focus-visible:after:ring-ring">
            <span className="font-normal text-muted-foreground">{owner}/</span>
            {name}
          </Link>
          {r.private && (
            <Badge variant="outline" className="font-normal">
              <Lock aria-hidden />
              Private
            </Badge>
          )}
        </h3>
        <ArrowUpRight
          aria-hidden
          className="size-4 shrink-0 text-muted-foreground opacity-0 motion-safe:transition-[opacity,translate,color] motion-safe:duration-150 group-focus-within:opacity-100 group-hover:text-foreground group-hover:opacity-100 motion-safe:group-hover:translate-x-0.5 motion-safe:group-hover:-translate-y-0.5"
        />
      </div>
      <div className="px-5">
        <Spark r={r} />
        <p className="mt-1.5 text-xs text-muted-foreground">
          <span className="font-medium text-foreground tabular-nums">{r.items_30d.toLocaleString()}</span> items in 30 days
        </p>
      </div>
      <dl className="grid grid-cols-3 gap-3 px-5">
        <Metric label="Accuracy" value={pct(r.accuracy)} detail={r.accuracy === null ? "not measured" : n ? `n = ${n.toLocaleString()}` : "n …"} />
        <Metric label="Overrides" value={pct(r.override_rate)} detail={r.override_rate === null ? "no decisions" : "of decisions"} />
        <Metric label="Auto-acted" value={pct(r.acted_share)} detail={r.acted_share === null ? "no decisions" : "of items"} />
      </dl>
      <div className="flex min-h-5 flex-wrap gap-1.5 px-5" aria-label="Feature modes">
        {detailsLoading && <Skeleton className="h-5 w-40" />}
        {detail && Object.entries(detail.features).map(([f, m]) => (
          <Badge key={f} variant={MODE[m]} title={`${f} is ${m}`}>
            {f.replace(/_/g, " ")} <span className="opacity-70">{m}</span>
          </Badge>
        ))}
      </div>
      <div className="mt-auto flex items-center gap-5 border-t px-5 pt-4 text-[13px]">
        <Count href={repoPath(r.id, "queue")} icon={<Inbox aria-hidden className="size-3.5" />} n={r.queued_open} label="in queue" />
        <Count href={repoPath(r.id, "held")} icon={<CirclePause aria-hidden className="size-3.5" />} n={r.held_open} label="held" />
      </div>
    </Card>
  );
}

/** A repository that is not enabled yet: one slim row with the way forward. */
export function OffRepoRow({ r }: { r: RepoCard }) {
  const [owner, name] = r.full_name.split("/");
  const admin = r.role === "admin";
  return (
    <li className="relative flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-3 hover:bg-muted/40 sm:px-5">
      <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
        <Link href={cardHref(r)} className="truncate rounded-sm text-sm font-medium outline-none after:absolute after:inset-0 focus-visible:after:ring-2 focus-visible:after:ring-ring focus-visible:after:ring-inset">
          <span className="font-normal text-muted-foreground">{owner}/</span>
          {name}
        </Link>
        {r.private && (
          <Badge variant="outline" className="font-normal">
            <Lock aria-hidden />
            Private
          </Badge>
        )}
        <Status tone="neutral" className="text-xs">Disabled</Status>
        {r.private && (
          <InfoHint className="relative z-10" label="Why is this repository off?">
            Private repositories stay off until an admin acknowledges that their content goes to the decision backend.
          </InfoHint>
        )}
      </div>
      {admin ? (
        <Button asChild variant="outline" size="sm" className="relative z-10">
          <Link href={cardHref(r)}>Finish setup</Link>
        </Button>
      ) : (
        <span className="text-xs text-muted-foreground">An admin has to enable it</span>
      )}
    </li>
  );
}

function Count({ href, icon, n, label }: { href: string; icon: React.ReactNode; n: number; label: string }) {
  return (
    <Link href={href} className={cn("relative z-10 inline-flex items-center gap-1.5 rounded-sm hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none", n ? "text-foreground" : "text-muted-foreground")}>
      {icon}
      <span className="font-medium tabular-nums">{n}</span> {label}
    </Link>
  );
}
