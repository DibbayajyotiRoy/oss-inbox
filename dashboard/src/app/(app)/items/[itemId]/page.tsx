"use client";
import { Bot, CircleDot, CircleCheck, ExternalLink, GitMerge, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { CopyForAgent, copyForAgent, itemContext } from "@/components/agents/context";
import { OpenedBy } from "@/components/review/author";
import { itemRef, kindName } from "@/components/review/row";
import { OpenInVSCode } from "@/components/review/vscode";
import { ActionsTaken, Decisions, OverridesHistory, RunsTable, Section, Seen } from "@/components/review/item-sections";
import { useCommands } from "@/components/shell/commands";
import { useShell } from "@/components/shell/shell-context";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { InlineCode } from "@/components/ui/inline-code";
import { Kbd } from "@/components/ui/kbd";
import { Load } from "@/components/ui/load";
import { PageHeader } from "@/components/ui/page-header";
import { SectionNav } from "@/components/ui/section-nav";
import { Busy, Skeleton } from "@/components/ui/skeleton";
import { Status, type StatusTone } from "@/components/ui/status";
import { repoPath } from "@/lib/fmt";
import { answerText } from "@/lib/questions";
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
    <Load res={res} fallback={<ItemSkeleton />} errorTitle="Item">
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
  const ref = itemRef(item);
  const github = () => item.html_url && window.open(item.html_url, "_blank", "noopener");

  // The latest check's answers, as markdown for an AI chat.
  const context = () => {
    const ds = runs.find((r) => r.decisions.length)?.decisions ?? [];
    const why = ds.filter((x) => x.outcome === "held").map((x) => answerText(x.question_id, x.answer)).join("; ");
    return itemContext(item, ds, why, !!why);
  };

  useCommands([
    { id: "item:agent", label: "Copy item for agent", group: "Item", icon: Bot, keywords: "mcp ai claude chat context markdown", run: () => copyForAgent(context()) },
    { id: "item:github", label: "Open on GitHub", group: "Item", icon: ExternalLink, keys: "o", run: github },
    { id: "item:back", label: `Back to ${list.endsWith("/held") ? "held" : "needs review"}`, group: "Item", keys: "Esc", run: back },
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
          <Link href={list} className="rounded-sm outline-none link-grow hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring">
            {list.endsWith("/held") ? "Held" : "Needs review"}
          </Link>
          <span aria-hidden>/</span>
          <span>{card?.full_name ?? "Repository"}</span>
          <span aria-hidden>/</span>
          <span aria-current="page" className="text-foreground tabular-nums">{ref}</span>
        </nav>
        <PageHeader
          className="mb-0"
          title={<InlineCode text={item.title} />}
          description={
            <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <Badge variant="outline">{kindName(item.kind)}</Badge>
              {item.html_url ? (
                <a href={item.html_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 tabular-nums link-grow hover:text-foreground">
                  {ref}<ExternalLink aria-hidden className="size-3" /><span className="sr-only">Open on GitHub</span>
                </a>
              ) : (
                <span className="tabular-nums">{ref}</span>
              )}
              <OpenedBy who={item} at={item.created_at} />
              <Status tone={s.tone} icon={s.icon} className="capitalize">{item.state}</Status>
            </span>
          }
          actions={
            <>
              <OpenInVSCode item={item} />
              <CopyForAgent text={context} />
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

      <SectionNav>
      <div className="flex flex-col gap-10">
      <Section title="What Jev decided" aside={runs.length ? `${runs.length} ${runs.length === 1 ? "check" : "checks"}` : undefined}>
        <Decisions runs={runs} overrides={d.overrides} canAct={card?.role !== "viewer"} reload={reload} />
      </Section>
      <Seen run={runs[0]} />
      <Section title="What was done on GitHub"><ActionsTaken actions={d.actions} /></Section>
      <Section title="Answers changed by people"><OverridesHistory overrides={d.overrides} runs={runs} /></Section>
      <Section title="Checks Jev ran"><RunsTable runs={runs} /></Section>
      </div>
      </SectionNav>
    </div>
  );
}

function ItemSkeleton() {
  return (
    <Busy className="flex flex-col gap-10">
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
    </Busy>
  );
}
