"use client";
import { useState } from "react";
import { Check, CircleX } from "lucide-react";
import { useRepo } from "@/components/repo";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CardSection } from "@/components/ui/card";
import { CopyButton } from "@/components/ui/copy-button";
import { Kbd } from "@/components/ui/kbd";
import { Load } from "@/components/ui/load";
import { Status } from "@/components/ui/status";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useMod } from "@/components/shell/commands";
import { api } from "@/lib/api";
import { CONFIG_PATH, type ConfigDoc, type RenderedConfig } from "@/lib/types";
import { useApi } from "@/lib/use-api";
import { GithubLink, RowsSkeleton, useRun } from "./parts";
import { YamlEditor } from "./yaml-editor";

const SOURCE = {
  repo: ["Repo file", "Read from this repository's default branch."],
  org: ["Org defaults", "No file in this repo. Using the org-wide file in .github; a repo file overrides it."],
  default: ["Defaults", "No file yet. Save one to change anything."],
} as const;

export function Configuration() {
  const { repo } = useRepo();
  const res = useApi<ConfigDoc>(`/api/repos/${repo.id}/config`);
  return (
    <CardSection
      title="Config file"
      description="Edit the file, check it, then save it on GitHub."
      hint="OSS Inbox reads this file from your default branch. One bad line makes the whole file invalid, and OSS Inbox falls back to safe defaults (it never acts by itself) until you fix it."
    >
      <Load res={res} fallback={<RowsSkeleton rows={6} />}>{(doc) => <Editor doc={doc} />}</Load>
    </CardSection>
  );
}

function Editor({ doc }: { doc: ConfigDoc }) {
  const { repo } = useRepo();
  const mod = useMod();
  const [text, setText] = useState(doc.yaml);
  const [check, setCheck] = useState<{ text: string; res: RenderedConfig }>();
  const { busy, run } = useRun();
  const dirty = text !== doc.yaml;
  const fresh = check?.text === text ? check.res : undefined;
  const [source, sourceTip] = SOURCE[doc.source as keyof typeof SOURCE] ?? [doc.source, ""];
  const combo = mod === "Ctrl" ? "Ctrl S" : "⌘S";

  async function validate() {
    if (busy) return;
    const res = await run(() => api<RenderedConfig>(`/api/repos/${repo.id}/config/render`, { method: "POST", body: { yaml: text } }));
    if (res) setCheck({ text, res });
  }

  // Saving what was never checked is how a whole file ends up invalid.
  const blocked = fresh ? fresh.errors.length > 0 && "Fix the errors first" : dirty && `Check your changes first (${combo})`;
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <label htmlFor="cfg" className="truncate font-mono text-[13px] font-medium">{CONFIG_PATH}</label>
          <Tooltip>
            <TooltipTrigger asChild>
              <Badge variant="outline" tabIndex={0}>{source}</Badge>
            </TooltipTrigger>
            <TooltipContent>{sourceTip}</TooltipContent>
          </Tooltip>
          {dirty && <Badge variant="warning">Changed</Badge>}
        </div>
        {dirty && (
          <Button variant="ghost" size="sm" onClick={() => { setText(doc.yaml); setCheck(undefined); }}>Reset</Button>
        )}
      </div>

      <YamlEditor id="cfg" value={text} onChange={setText} onSave={validate} invalid={!!fresh?.errors.length} describedBy="cfg-result cfg-keys" />

      <div id="cfg-result" aria-live="polite">
        {fresh && (fresh.errors.length ? (
          <div role="alert" className="rounded-lg border border-destructive/40 bg-destructive/5 p-3">
            <Status tone="danger" icon={CircleX}>{fresh.errors.length} {fresh.errors.length === 1 ? "problem" : "problems"}</Status>
            <ul className="mt-2 flex flex-col gap-1 font-mono text-xs break-words text-destructive">
              {fresh.errors.map((e) => <li key={e}>{e}</li>)}
            </ul>
          </div>
        ) : (
          <Status tone="success" icon={Check}>Looks good. Nothing is saved until you save it on GitHub.</Status>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" loading={busy} onClick={validate}>
          Check file <Kbd className="max-sm:hidden">{combo}</Kbd>
        </Button>
        <CopyButton value={text} label="Copy file text" variant="outline" size="md" />
        <div className="sm:ml-auto">
          <GithubLink
            href={fresh?.edit_url ?? doc.edit_url}
            yaml={text}
            reason={blocked}
            variant={fresh && !fresh.errors.length && dirty ? "primary" : "outline"}
          >
            {dirty ? "Save in GitHub" : "Open in GitHub"}
          </GithubLink>
        </div>
      </div>
      <p id="cfg-keys" className="text-[13px] text-muted-foreground">Tab indents. Esc, then Tab, leaves the editor. Changes apply after you save to {repo.default_branch}.</p>
    </div>
  );
}
