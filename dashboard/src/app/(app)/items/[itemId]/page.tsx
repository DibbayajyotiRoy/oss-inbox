"use client";
import { CircleDot, CircleCheck, ExternalLink, GitMerge, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ActionsTaken, Decisions, OverridesHistory, RunsTable, Section, Seen } from "@/components/review/item-sections";
import { useCommands } from "@/components/shell/commands";
import { useShell } from "@/components/shell/shell-context";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Kbd } from "@/components/ui/kbd";
import { Load } from "@/components/ui/load";
import { PageHeader } from "@/components/ui/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { Status, type StatusTone } from "@/components/ui/status";
import { day, repoPath } from "@/lib/fmt";
import type { ItemDetail } from "@/lib/types";
import { useApi } from "@/lib/use-api";

const STATE: Record<string, { tone: StatusTone; icon: LucideIcon }> = {
  open: { tone: "success", icon: CircleDot },
  closed: { tone: "neutral", icon: CircleCheck },
  merged: { tone: "neutral", icon: GitMerge },
};

export default function ItemPage() {
  const { itemId } = useParams<{ itemId: string }>();
  const res = useApi<ItemDetail>(`/api/items/${itemId}`);
  return (
    <Load res={res} fallback={<ItemSkeleton />}>
      {(d) => <Detail d={d} reload={res.reload} />}
    </Load>
  );
}

function Detail({ d, reload }: { d: ItemDetail; reload: () => void }) {
  const { item } = d;
  const runs = [...d.runs].sort((a, b) => b.id - a.id); // latest first
  const router = useRouter();
  const { overview } = useShell();
  const card = overview?.repos.find((r) => r.id === item.repo_id);
  // The list you came from (the review list remembers its path); any list of this repo, else the queue.
  const [list] = useState(() => {
    try {
      const p = sessionStorage.getItem("jev:list");
      if (p?.startsWith(`/repos/${item.repo_id}/`)) return p;
    } catch {}
    return repoPath(item.repo_id);
  });
  const back = () => router.push(list);
  const s = STATE[item.state] ?? STATE.open;
  const ref = item.number ? `#${item.number}` : item.kind.replace("_", " ");
  const github = () => item.html_url && window.open(item.html_url, "_blank", "noopener");

  useCommands([
    { id: "item:github", label: "Open on GitHub", group: "Item", icon: ExternalLink, keys: "o", run: github },
    { id: "item:back", label: `Back to ${list.endsWith("/held") ? "held" : "queue"}`, group: "Item", keys: "Esc", run: back },
  ]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey) return;
      if (document.querySelector('[role="dialog"],[role="menu"],[role="listbox"]')) return; // an open overlay owns Esc
      router.push(list);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [router, list]);

  return (
    <div className="flex flex-col gap-10">
      <div>
        <nav aria-label="Breadcrumb" className="mb-4 flex items-center gap-1.5 text-[13px] text-muted-foreground">
          <Link href={list} className="rounded-sm outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring">
            {list.endsWith("/held") ? "Held" : "Queue"}
          </Link>
          <span aria-hidden>/</span>
          <span>{card?.full_name ?? "Repository"}</span>
          <span aria-hidden>/</span>
          <span aria-current="page" className="text-foreground tabular-nums">{ref}</span>
        </nav>
        <PageHeader
          className="mb-0"
          title={item.title}
          description={
            <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <Badge variant="outline">{item.kind.replace("_", " ")}</Badge>
              {item.html_url ? (
                <a href={item.html_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 tabular-nums hover:text-foreground">
                  {ref}<ExternalLink aria-hidden className="size-3" /><span className="sr-only">Open on GitHub</span>
                </a>
              ) : (
                <span className="tabular-nums">{ref}</span>
              )}
              <span>{item.author ?? "unknown author"}</span>
              <Status tone={s.tone} icon={s.icon} className="capitalize">{item.state}</Status>
              <span className="tabular-nums">{day(item.created_at)}</span>
            </span>
          }
          actions={
            <>
              {item.html_url && (
                <Button variant="outline" size="sm" onClick={github}>
                  Open on GitHub<Kbd className="max-sm:hidden">O</Kbd>
                </Button>
              )}
              <Button variant="ghost" size="sm" onClick={back}>
                Back<Kbd className="max-sm:hidden">Esc</Kbd>
              </Button>
            </>
          }
        />
      </div>

      <Section title="Decisions" aside={runs.length ? `${runs.length} ${runs.length === 1 ? "run" : "runs"}` : undefined}>
        <Decisions runs={runs} overrides={d.overrides} canAct={card?.role !== "viewer"} reload={reload} />
      </Section>
      <Seen run={runs[0]} />
      <Section title="Actions taken"><ActionsTaken actions={d.actions} /></Section>
      <Section title="Override history"><OverridesHistory overrides={d.overrides} runs={runs} /></Section>
      <Section title="Runs"><RunsTable runs={runs} /></Section>
    </div>
  );
}

function ItemSkeleton() {
  return (
    <div role="status" aria-busy="true" className="flex flex-col gap-10">
      <span className="sr-only">Loading</span>
      <div className="flex flex-col gap-3">
        <Skeleton className="h-4 w-56" />
        <Skeleton className="h-8 w-2/3" />
        <Skeleton className="h-4 w-80 max-w-full" />
      </div>
      <div className="flex flex-col gap-3">
        <Skeleton className="h-6 w-32" />
        <Skeleton className="h-40 w-full" />
      </div>
      <Skeleton className="h-6 w-48" />
      {[0, 1].map((i) => (
        <div key={i} className="flex flex-col gap-3">
          <Skeleton className="h-6 w-36" />
          <Skeleton className="h-16 w-full" />
        </div>
      ))}
    </div>
  );
}
