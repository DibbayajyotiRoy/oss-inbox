"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ExternalLink, Eye, ListChecks, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Notice } from "@/components/ui/notice";
import { Checkbox } from "@/components/ui/checkbox";
import { CodeBlock } from "@/components/ui/code-block";
import { ErrorState } from "@/components/ui/load";
import { Skeleton } from "@/components/ui/skeleton";
import { Status } from "@/components/ui/status";
import { toast } from "@/components/ui/toaster";
import { api } from "@/lib/api";
import { labelRows, type ConfigDoc, type LabelPlan, type Me, type Onboarding, type Repo } from "@/lib/types";
import { useAction, useApi } from "@/lib/use-api";
import { Continue, Flow, FlowError, FlowSkeleton, Primary, useInterval } from "./flow";
import { MeasureStep } from "./measure-step";
import { ModesStep } from "./modes-step";
import { Rows } from "./parts";

// The server's step titles, in plain words.
const STEP_TITLE: Record<string, string> = { enabled: "Turn on the repository", backfill: "Check Jev on your past issues", mode: "Let a feature act by itself" };

/** Per-repo setup at /onboarding/[repoId]. Resumes at the first required step the server reports as not done. */
export function RepoFlow({ repoId }: { repoId: number }) {
  const ob = useApi<Onboarding>(`/api/repos/${repoId}/onboarding`);
  const res = useApi<Repo>(`/api/repos/${repoId}`);
  const me = useApi<Me>("/api/me").data;
  const error = ob.error ?? res.error;
  const repo = res.data;
  if (!repo || !ob.data) return error ? <FlowError error={error} retry={() => {
          ob.reload();
          res.reload();
        }} /> : <FlowSkeleton />;

  const done = (id: string) => ob.data!.steps.find((s) => s.id === id)?.done;
  // "/" opens a repo, so with nothing turned on yet it would lead straight back here: leave to the org's list instead.
  const org = me?.orgs.find((o) => repo.full_name.startsWith(`${o.login}/`));
  const initial = !done("enabled") ? 0 : !done("labels") ? 1 : !done("backfill") ? 3 : 4;
  return (
    <Flow
      initial={initial}
      right={
        <div className="flex items-center gap-3">
          <span className="hidden font-mono text-xs text-muted-foreground sm:inline">{repo.full_name}</span>
          <Button asChild variant="ghost" size="sm">
            <Link href={org ? `/orgs/${org.id}` : "/"}>Exit setup</Link>
          </Button>
        </div>
      }
      steps={[
        { id: "enable", name: "Turn on", title: "Turn on this repository", subtitle: "At first Jev only suggests, never acts.", body: <EnableStep repo={repo} reload={res.reload} /> },
        { id: "labels", name: "Labels", title: "Create the labels", subtitle: "Jev tags items with these.", body: <LabelsStep repoId={repoId} /> },
        { id: "config", name: "Config file", title: "Add a config file", subtitle: "Defaults work without it.", optional: true, body: <ConfigStep repo={repo} /> },
        { id: "measure", name: "Check", title: "Check Jev on your past issues", subtitle: "Try Jev on closed issues before it acts.", body: <MeasureStep repo={repo} reload={res.reload} /> },
        { id: "modes", name: "Settings", title: "Choose what Jev may do", subtitle: "Learning suggests. On acts by itself.", body: <ModesStep repo={repo} reload={res.reload} /> },
        { id: "done", name: "Done", title: "Ready for live items", subtitle: "Watch Needs review fill up.", body: <DoneStep repo={repo} /> },
      ]}
    />
  );
}

function EnableStep({ repo, reload }: { repo: Repo; reload: () => void }) {
  const [ack, setAck] = useState(false);
  const act = useAction();
  const admin = repo.role === "admin";
  const enable = () =>
    act.run(async () => {
      await api(`/api/repos/${repo.id}`, { method: "PATCH", body: { enabled: true, acknowledge_private: ack } });
      reload();
    });
  return (
    <div className="flex flex-col gap-6">
      <Rows label="What turning it on does">
        {[
          { Icon: Eye, text: "Reads new issues and pull requests" },
          { Icon: ListChecks, text: "Suggests answers for you to review" },
          { Icon: ShieldCheck, text: "Never closes, deletes or locks anything" },
        ].map(({ Icon, text }) => (
          <li key={text} className="flex items-center gap-3 px-4 py-3 text-sm">
            <Icon aria-hidden className="size-4 shrink-0 text-muted-foreground" />
            {text}
          </li>
        ))}
      </Rows>

      {repo.enabled ? (
        <>
          <Status tone="success" className="text-sm">
            {repo.full_name} is on
          </Status>
          <Continue />
        </>
      ) : (
        <>
          {repo.private ? (
            <label className="flex cursor-pointer items-start gap-3 rounded-lg border p-4 text-sm">
              <Checkbox checked={ack} onCheckedChange={setAck} data-enter-continues className="mt-0.5" />
              <span>
                This repository is private. I understand its issue and PR text is sent to the model provider (<span className="font-mono">{repo.backend}</span>).
              </span>
            </label>
          ) : null}
          {admin ? null : <Notice tone="warning" title="Only admins can turn this on">Ask an admin of {repo.full_name}, or continue and come back.</Notice>}
          {act.error ? (
            <p role="alert" className="text-sm text-destructive">
              {act.error.message}
            </p>
          ) : null}
          <Primary loading={act.busy} disabled={!admin || (repo.private && !ack)} onClick={enable}>
            Turn on
          </Primary>
        </>
      )}
    </div>
  );
}

function LabelsStep({ repoId }: { repoId: number }) {
  const plan = useApi<LabelPlan>(`/api/repos/${repoId}/labels/plan`);
  const [created, setCreated] = useState<string[]>([]);
  const act = useAction();
  if (plan.error)
    return (
      <div className="flex flex-col gap-6">
        <ErrorState error={plan.error} retry={plan.reload} />
        <Primary disabled>Create labels</Primary>
      </div>
    );
  if (!plan.data) return <Skeleton className="h-48 w-full" />;

  const have = new Set([...plan.data.existing, ...created].map((l) => l.toLowerCase()));
  const rows = labelRows(plan.data.mapping).map((r) => ({ ...r, ok: have.has(r.label.toLowerCase()) }));
  const missing = plan.data.missing.filter((l) => !have.has(l.toLowerCase()));
  const sync = () =>
    act.run(async () => {
      const r = await api<{ created: string[] }>(`/api/repos/${repoId}/labels/sync`, { method: "POST" });
      setCreated(r.created);
      toast.success(r.created.length ? `Created ${r.created.length} ${r.created.length === 1 ? "label" : "labels"}` : "Labels are up to date");
      plan.reload();
    });
  const list = (items: typeof rows, label: string) => (
    <Rows label={label}>
      {items.map((r) => (
        <li key={r.purpose} className="flex items-center gap-3 px-4 py-2.5 text-sm">
          <span className="min-w-0 flex-1 truncate font-mono text-xs text-muted-foreground">{r.purpose}</span>
          <span className="shrink-0 rounded-md border bg-muted/40 px-1.5 py-0.5 font-mono text-xs">{r.label}</span>
          <Status tone={r.ok ? "success" : "waiting"} className="w-20 shrink-0 justify-end">
            {r.ok ? "Exists" : "Missing"}
          </Status>
        </li>
      ))}
    </Rows>
  );
  const exist = rows.filter((r) => r.ok);
  return (
    <div className="flex flex-col gap-6">
      <p className="text-sm text-muted-foreground" aria-live="polite">
        {missing.length ? `${missing.length} of ${rows.length} labels are missing. Existing labels are never changed.` : "Every label Jev uses already exists."}
      </p>
      {missing.length ? list(rows.filter((r) => !r.ok), "Missing labels") : null}
      {exist.length ? (
        <details className="group">
          <summary className="cursor-pointer rounded-md text-sm text-muted-foreground outline-none select-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring">
            {exist.length} already exist
          </summary>
          <div className="mt-3">{list(exist, "Existing labels")}</div>
        </details>
      ) : null}
      {act.error ? (
        <p role="alert" className="text-sm text-destructive">
          {act.error.message}
        </p>
      ) : null}
      {missing.length ? (
        <Primary loading={act.busy} onClick={sync}>
          Create {missing.length} {missing.length === 1 ? "label" : "labels"}
        </Primary>
      ) : (
        <Continue />
      )}
    </div>
  );
}

function ConfigStep({ repo }: { repo: Repo }) {
  const cfg = useApi<ConfigDoc>(`/api/repos/${repo.id}/config`);
  const d = cfg.data;
  return (
    <div className="flex flex-col gap-6">
      {repo.config_error ? (
        <Notice tone="warning" title="OSS Inbox cannot read your config. It is using defaults.">
          <span className="font-mono text-xs break-words">{repo.config_error}</span>
        </Notice>
      ) : (
        <Status tone={repo.config_source === "default" ? "waiting" : "success"} className="text-sm">
          {{ repo: "Using .github/oss-inbox.yml from the repo", org: "Using your organization defaults", default: "No config file yet. Built-in defaults apply." }[repo.config_source]}
        </Status>
      )}
      {cfg.error ? (
        <ErrorState error={cfg.error} retry={cfg.reload} />
      ) : d ? (
        <>
          <CodeBlock filename=".github/oss-inbox.yml" code={d.yaml} className="[&_pre]:max-h-72 [&_pre]:overflow-y-auto" />
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-[13px] text-muted-foreground">Nothing changes until you save it on GitHub.</p>
            <Button asChild variant="outline" size="sm">
              <a href={d.edit_url} target="_blank" rel="noreferrer">
                {repo.config_source === "repo" ? "Edit in GitHub" : "Open in GitHub"}
                <ExternalLink />
              </a>
            </Button>
          </div>
        </>
      ) : (
        <Skeleton className="h-48 w-full" />
      )}
      <Continue />
    </div>
  );
}

function DoneStep({ repo }: { repo: Repo }) {
  const router = useRouter();
  const ob = useApi<Onboarding>(`/api/repos/${repo.id}/onboarding`);
  const first = ob.data?.steps.find((s) => s.id === "first_event");
  // The first live decision arrives on its own; look until it does.
  useInterval(ob.reload, ob.data && !first?.done ? 5000 : null);
  const acting = Object.values(repo.features).includes("auto");
  return (
    <div className="flex flex-col gap-6">
      {ob.error ? (
        <ErrorState error={ob.error} retry={ob.reload} />
      ) : !ob.data ? (
        <Skeleton className="h-56 w-full" />
      ) : (
        <Rows label="Setup progress">
          {ob.data.steps.map((s) => (
            <li key={s.id} className="flex flex-col gap-0.5 px-4 py-3 text-sm">
              <div className="flex items-center justify-between gap-3">
                <span>{STEP_TITLE[s.id] ?? s.title}</span>
                <Status tone={s.done ? "success" : s.optional ? "neutral" : "waiting"}>{s.done ? "Done" : s.optional ? "Optional" : "To do"}</Status>
              </div>
              {!s.done && !s.optional && s.detail ? <p className="text-[13px] text-muted-foreground">{s.detail}</p> : null}
            </li>
          ))}
        </Rows>
      )}
      {acting ? null : <p className="text-[13px] text-muted-foreground">Everything is Learning or Off, so nothing on GitHub changes yet.</p>}
      <Primary variant="outline" asChild>
        <a href={`https://github.com/${repo.full_name}/issues/new`} target="_blank" rel="noreferrer">
          Open a test issue
          <ExternalLink />
        </a>
      </Primary>
      <Primary onClick={() => router.push(`/repos/${repo.id}/queue`)}>Open Needs review</Primary>
    </div>
  );
}
