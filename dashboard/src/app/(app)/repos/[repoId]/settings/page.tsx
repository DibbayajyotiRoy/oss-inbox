"use client";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Bot, FileCode2, GitBranch, KeyRound, Lock, ScrollText, Tag, Workflow, type LucideIcon } from "lucide-react";
import type { ComponentType } from "react";
import { useRepo } from "@/components/repo";
import { PageHeader } from "@/components/ui/page-header";
import { Agents } from "@/components/agents/settings";
import { Audit } from "@/components/settings/audit";
import { Automation } from "@/components/settings/automation";
import { Configuration } from "@/components/settings/configuration";
import { Labels } from "@/components/settings/labels";
import { Repository } from "@/components/settings/repository";
import { Tokens } from "@/components/settings/tokens";
import { repoPath } from "@/lib/fmt";
import { atLeast, type Role } from "@/lib/types";
import { cn } from "@/lib/utils";

// `?s=<id>` picks the section, so every section is linkable (the repo header links to automation and config).
const SECTIONS: { id: string; label: string; icon: LucideIcon; View: ComponentType; need?: Role }[] = [
  { id: "automation", label: "Automation", icon: Workflow, View: Automation },
  { id: "config", label: "Config file", icon: FileCode2, View: Configuration },
  { id: "labels", label: "Labels", icon: Tag, View: Labels },
  { id: "tokens", label: "CI tokens", icon: KeyRound, View: Tokens, need: "admin" },
  { id: "agents", label: "Agents & MCP", icon: Bot, View: Agents, need: "admin" },
  { id: "repository", label: "Repository", icon: GitBranch, View: Repository },
  { id: "audit", label: "Activity log", icon: ScrollText, View: Audit, need: "maintainer" },
];

export default function Settings() {
  const { repo } = useRepo();
  const s = useSearchParams().get("s");
  const cur = SECTIONS.find((x) => x.id === s) ?? SECTIONS[0];
  return (
    <>
      <PageHeader title="Settings" description="Automation, config file, tokens, agents, access." />
      <div className="grid gap-6 lg:grid-cols-[11rem_minmax(0,1fr)] lg:gap-10">
        <nav
          aria-label="Settings sections"
          className="-mx-4 flex gap-1 overflow-x-auto px-4 [scrollbar-width:none] sm:-mx-6 sm:px-6 lg:sticky lg:top-0 lg:mx-0 lg:flex-col lg:self-start lg:overflow-visible lg:px-0"
        >
          {SECTIONS.map(({ id, label, icon: Icon, need }) => {
            const on = id === cur.id;
            return (
              <Link
                key={id}
                href={`${repoPath(repo.id, "settings")}?s=${id}`}
                replace
                scroll={false}
                aria-current={on ? "page" : undefined}
                className={cn(
                  "hover-pill relative inline-flex h-8 shrink-0 items-center gap-2 rounded-md px-2.5 text-[13px] font-medium whitespace-nowrap outline-none motion-safe:transition-colors motion-safe:duration-150 focus-visible:ring-2 focus-visible:ring-ring",
                  on ? "bg-accent text-foreground" : "text-muted-foreground hover:text-foreground",
                )}
              >
                <Icon aria-hidden className="size-4" />
                {label}
                {need && !atLeast(repo.role, need) && <Lock aria-label={`${need} only`} className="ml-auto size-3 opacity-60 max-lg:ml-0" />}
              </Link>
            );
          })}
        </nav>
        <div key={cur.id} className="min-w-0 motion-safe:animate-in motion-safe:duration-250 motion-safe:ease-settle motion-safe:fade-in-0 motion-safe:slide-in-from-bottom-1">
          <cur.View />
        </div>
      </div>
    </>
  );
}
