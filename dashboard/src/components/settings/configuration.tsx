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
  default: ["Defaults", "No file yet. Committing one is how you change anything."],
} as const;

export function Configuration() {
  const { repo } = useRepo();
  const res = useApi<ConfigDoc>(`/api/repos/${repo.id}/config`);
  return (
    <CardSection
      title="Configuration"
      description="Edit the file, validate, then commit it on GitHub."
      hint="Jev reads this file from your default branch. Unknown keys or bad values make the whole file invalid and defaults (which never act) apply until you fix it."
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

  // Committing what was never validated is how a whole file ends up invalid.
  const blocked = fresh ? fresh.errors.length > 0 && "Fix the errors first" : dirty && `Validate your edits first (${combo})`;
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
          {dirty && <Badge variant="warning">Edited</Badge>}
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
          <Status tone="success" icon={Check}>Valid. Nothing is saved until you commit it.</Status>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" loading={busy} onClick={validate}>
          Validate <Kbd className="max-sm:hidden">{combo}</Kbd>
        </Button>
        <CopyButton value={text} label="Copy YAML" variant="outline" size="md" />
        <div className="sm:ml-auto">
          <GithubLink
            href={fresh?.edit_url ?? doc.edit_url}
            yaml={text}
            reason={blocked}
            variant={fresh && !fresh.errors.length && dirty ? "primary" : "outline"}
          >
            {dirty ? "Commit in GitHub" : "Open in GitHub"}
          </GithubLink>
        </div>
      </div>
      <p id="cfg-keys" className="text-[13px] text-muted-foreground">Tab indents. Esc, then Tab, leaves the editor. Changes apply after you commit to {repo.default_branch}.</p>
    </div>
  );
}
