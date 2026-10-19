"use client";
import { useState, type FormEvent } from "react";
import { KeyRound, Plus } from "lucide-react";
import { useRepo } from "@/components/repo";
import { Button } from "@/components/ui/button";
import { CardSection } from "@/components/ui/card";
import { CodeBlock } from "@/components/ui/code-block";
import { CopyButton } from "@/components/ui/copy-button";
import { DataTable } from "@/components/ui/data-table";
import { Dialog } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Load } from "@/components/ui/load";
import { Status } from "@/components/ui/status";
import { Tabs } from "@/components/ui/tabs";
import { toast } from "@/components/ui/toaster";
import { api } from "@/lib/api";
import { when } from "@/lib/fmt";
import { type CiToken, NEED, type NewToken } from "@/lib/types";
import { useApi } from "@/lib/use-api";
import { cn } from "@/lib/utils";
import { Confirm, Gate, RowsSkeleton, useRun } from "./parts";
import { ACTIONS_STEP, curlReport } from "./snippets";

export function Tokens() {
  const { repo, isAdmin } = useRepo();
  const res = useApi<{ items: CiToken[] }>(isAdmin ? `/api/repos/${repo.id}/ci-tokens` : null);
  const [creating, setCreating] = useState(false);
  const [revoking, setRevoking] = useState<CiToken>();
  const { busy, run } = useRun();

  async function revoke() {
    if (!revoking) return;
    if (await run(() => api(`/api/repos/${repo.id}/ci-tokens/${revoking.id}`, { method: "DELETE" }))) {
      toast.success(`Revoked ${revoking.name}`);
      setRevoking(undefined);
      res.reload();
    }
  }

  const create = (
    <Gate reason={!isAdmin && NEED.admin}>
      <Button size="sm" onClick={() => setCreating(true)}><Plus aria-hidden />Create token</Button>
    </Gate>
  );
  return (
    <CardSection
      title="CI tokens"
      description="Let your CI send failures to OSS Inbox."
      hint="Each token works for one repository and is shown once. OSS Inbox keeps only a scrambled copy. Revoking one stops its CI jobs right away."
      action={create}
    >
      {!isAdmin ? (
        <EmptyState title="Admins manage CI tokens" description="Ask an admin of this repository to create or revoke one." />
      ) : (
        <Load
          res={res}
          fallback={<RowsSkeleton rows={3} />}
          isEmpty={(d) => d.items.length === 0}
          empty={<EmptyState title="No CI tokens yet" description="Create one to send CI failures here." action={<Button onClick={() => setCreating(true)}>Create token</Button>} />}
        >
          {(d) => (
            <DataTable
              label="CI tokens"
              storageKey="settings-tokens"
              rows={d.items}
              rowKey={(t) => t.id}
              columns={[
                { key: "name", header: "Name", cell: (t) => <span className={cn("font-medium", t.revoked_at && "text-muted-foreground")}>{t.name}</span> },
                { key: "created", header: "Created", cellClassName: "text-muted-foreground tabular-nums", cell: (t) => `${when(t.created_at)} · ${t.created_by}` },
                {
                  key: "status",
                  header: "Status",
                  cell: (t) => (t.revoked_at ? <Status tone="neutral">Revoked {when(t.revoked_at)}</Status> : <Status tone="success">Active</Status>),
                },
                {
                  key: "actions",
                  header: <span className="sr-only">Actions</span>,
                  align: "right",
                  cell: (t) => !t.revoked_at && <Button variant="ghost" size="sm" onClick={() => setRevoking(t)}>Revoke</Button>,
                },
              ]}
            />
          )}
        </Load>
      )}
      <CreateDialog open={creating} onOpenChange={setCreating} onCreated={res.reload} />
      <Confirm
        open={!!revoking}
        onOpenChange={(o) => !o && setRevoking(undefined)}
        title={`Revoke ${revoking?.name ?? "token"}?`}
        description="CI jobs using this token will stop reporting. This cannot be undone."
        label="Revoke token"
        busy={busy}
        onConfirm={revoke}
      />
    </CardSection>
  );
}

type Made = NewToken & { origin: string };

function CreateDialog({ open, onOpenChange, onCreated }: { open: boolean; onOpenChange: (o: boolean) => void; onCreated: () => void }) {
  const { repo } = useRepo();
  const [name, setName] = useState("");
  const [made, setMade] = useState<Made>();
  const { busy, run } = useRun();

  function close(o: boolean) {
    onOpenChange(o);
    if (!o) setTimeout(() => { setMade(undefined); setName(""); }, 200); // after the exit animation
  }
  async function submit(e: FormEvent) {
    e.preventDefault();
    const r = await run(() => api<NewToken>(`/api/repos/${repo.id}/ci-tokens`, { method: "POST", body: { name: name.trim() } }));
    if (r) {
      setMade({ ...r, origin: window.location.origin });
      onCreated();
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={close}
      className={made ? "sm:max-w-2xl" : undefined}
      title={made ? "Token created" : "Create CI token"}
      description={made ? "Copy it now. It will not be shown again." : "Name it after where it will run."}
      footer={
        made ? (
          <Button onClick={() => close(false)}>Done</Button>
        ) : (
          <>
            <Button variant="outline" onClick={() => close(false)}>Cancel</Button>
            <Button type="submit" form="new-token" loading={busy} disabled={!name.trim()}>Create token</Button>
          </>
        )
      }
    >
      {made ? (
        <Created made={made} repoName={repo.full_name} />
      ) : (
        <form id="new-token" onSubmit={submit}>
          <Field label="Name" htmlFor="token-name">
            <Input id="token-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={100} placeholder="github-actions" autoComplete="off" />
          </Field>
        </form>
      )}
    </Dialog>
  );
}

/** The one moment the token exists in plain text: secrets to add, then a paste-ready step. */
function Created({ made, repoName }: { made: Made; repoName: string }) {
  const [tab, setTab] = useState("actions");
  const secrets = [["OSS_INBOX_CI_TOKEN", made.token], ["OSS_INBOX_URL", made.origin]];
  return (
    <div className="flex flex-col gap-5">
      <div>
        <p className="mb-2 flex items-center gap-1.5 text-[13px] font-medium"><KeyRound aria-hidden className="size-3.5" />1. Add two secrets to the repository</p>
        <dl className="divide-y divide-border rounded-lg border">
          {secrets.map(([k, v]) => (
            <div key={k} className="flex items-center gap-3 py-1.5 pr-1.5 pl-3">
              <dt className="w-28 shrink-0 font-mono text-xs text-muted-foreground">{k}</dt>
              <dd className="min-w-0 flex-1 font-mono text-[13px] break-all">{v}</dd>
              <CopyButton value={v} />
            </div>
          ))}
        </dl>
        <a
          className="mt-2 inline-block text-[13px] text-muted-foreground underline underline-offset-4 link-grow hover:text-foreground"
          href={`https://github.com/${repoName}/settings/secrets/actions`}
          target="_blank"
          rel="noreferrer noopener"
        >
          Open GitHub secrets
        </a>
      </div>
      <div className="flex flex-col gap-3">
        <p className="text-[13px] font-medium">2. Report failures from CI</p>
        <Tabs aria-label="Snippet" value={tab} onValueChange={setTab} items={[{ id: "actions", label: "GitHub Actions" }, { id: "curl", label: "curl" }]} />
        {tab === "actions" ? (
          <CodeBlock code={ACTIONS_STEP} filename="Add under steps: in .github/workflows/ci.yml" />
        ) : (
          <CodeBlock code={curlReport(made.origin, made.token, repoName)} filename="Shell" />
        )}
      </div>
    </div>
  );
}
