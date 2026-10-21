"use client";
import Link from "next/link";
import { useState, type FormEvent } from "react";
import { Plus } from "lucide-react";
import { useRepo } from "@/components/repo";
import { Confirm, Gate, RowsSkeleton, useRun } from "@/components/settings/parts";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CardSection } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { CopyButton } from "@/components/ui/copy-button";
import { DataTable } from "@/components/ui/data-table";
import { Dialog } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Load } from "@/components/ui/load";
import { Notice } from "@/components/ui/notice";
import { Status } from "@/components/ui/status";
import { toast } from "@/components/ui/toaster";
import { api } from "@/lib/api";
import { ago, repoPath, when } from "@/lib/fmt";
import { type AgentScope, type AgentToken, NEED, type NewAgentToken } from "@/lib/types";
import { useApi } from "@/lib/use-api";
import { cn } from "@/lib/utils";
import { Connect, useMcpUrl } from "./connect";

const SCOPES: { id: AgentScope; label: string; hint: string }[] = [
  { id: "read", label: "Read", hint: "See the queue, decisions and accuracy." },
  { id: "write", label: "Write", hint: "Also accept, dismiss or release items." },
];

export function Agents() {
  const { repo, isAdmin } = useRepo();
  const res = useApi<{ items: AgentToken[] }>(isAdmin ? `/api/repos/${repo.id}/agent-tokens` : null);
  const url = useMcpUrl();
  const [creating, setCreating] = useState(false);
  const [revoking, setRevoking] = useState<AgentToken>();
  const { busy, run } = useRun();

  async function revoke() {
    if (!revoking) return;
    if (await run(() => api(`/api/repos/${repo.id}/agent-tokens/${revoking.id}`, { method: "DELETE" }))) {
      toast.success(`Revoked ${revoking.name}`);
      setRevoking(undefined);
      res.reload();
    }
  }

  return (
    <CardSection
      title="Agents & MCP"
      description="Let AI agents use your queue."
      hint="MCP is the standard way AI tools connect to apps. Each token works for one repository and is shown once. OSS Inbox keeps only a scrambled copy. Revoking one cuts the agent off right away."
      action={
        <Gate reason={!isAdmin && NEED.admin}>
          <Button size="sm" onClick={() => setCreating(true)}><Plus aria-hidden />Create token</Button>
        </Gate>
      }
    >
      <p className="mb-4 max-w-prose text-sm text-pretty text-muted-foreground">
        Agents such as Claude Code, Cursor and VS Code, or any MCP client, can read your review queue and explain every decision.
        With a write token they can also resolve items, under the same rules as you.
      </p>
      {!isAdmin ? (
        <EmptyState title="Admins manage agent tokens" description="Ask an admin of this repository to create or revoke one." />
      ) : (
        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-3 rounded-lg border py-1.5 pr-1.5 pl-3">
            <span className="shrink-0 text-xs text-muted-foreground">Endpoint</span>
            <code className="min-w-0 flex-1 font-mono text-[13px] break-all">{url}</code>
            <CopyButton value={url} />
          </div>
          <Load
            res={res}
            fallback={<RowsSkeleton rows={3} />}
            isEmpty={(d) => d.items.length === 0}
            empty={<EmptyState title="No agent tokens yet" description="Create one to connect an agent." action={<Button onClick={() => setCreating(true)}>Create token</Button>} />}
          >
            {(d) => (
              <DataTable
                label="Agent tokens"
                storageKey="settings-agents"
                rows={d.items}
                rowKey={(t) => t.id}
                columns={[
                  { key: "name", header: "Name", cell: (t) => <span className={cn("font-medium", t.revoked_at && "text-muted-foreground")}>{t.name}</span> },
                  {
                    key: "scopes",
                    header: "Access",
                    cell: (t) => (
                      <span className="inline-flex gap-1">
                        {t.scopes.map((s) => <Badge key={s} variant={s === "write" ? "warning" : "outline"} className="capitalize">{s}</Badge>)}
                      </span>
                    ),
                  },
                  {
                    key: "used",
                    header: "Last used",
                    className: "max-sm:hidden",
                    cellClassName: "text-muted-foreground tabular-nums",
                    cell: (t) => (t.last_used_at ? <time dateTime={t.last_used_at} title={when(t.last_used_at)}>{ago(t.last_used_at)}</time> : "Never"),
                  },
                  {
                    key: "status",
                    header: "Status",
                    cell: (t) => (t.revoked_at ? <Status tone="neutral">Revoked</Status> : <Status tone="success">Active</Status>),
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
          <p className="text-xs text-muted-foreground">
            What an agent does shows in the{" "}
            <Link href={`${repoPath(repo.id, "settings")}?s=audit`} className="underline underline-offset-4 link-grow hover:text-foreground">activity log</Link>{" "}
            as <code className="font-mono">agent:name</code>.
          </p>
        </div>
      )}
      <CreateDialog open={creating} onOpenChange={setCreating} onCreated={res.reload} url={url} />
      <Confirm
        open={!!revoking}
        onOpenChange={(o) => !o && setRevoking(undefined)}
        title={`Revoke ${revoking?.name ?? "token"}?`}
        description="The agent loses access right away. This cannot be undone."
        label="Revoke token"
        busy={busy}
        onConfirm={revoke}
      />
    </CardSection>
  );
}

function CreateDialog({ open, onOpenChange, onCreated, url }: { open: boolean; onOpenChange: (o: boolean) => void; onCreated: () => void; url: string }) {
  const { repo } = useRepo();
  const [name, setName] = useState("");
  const [scopes, setScopes] = useState<AgentScope[]>(["read"]);
  const [made, setMade] = useState<NewAgentToken>();
  const { busy, run } = useRun();
  const write = scopes.includes("write");

  function close(o: boolean) {
    onOpenChange(o);
    if (!o) setTimeout(() => { setMade(undefined); setName(""); setScopes(["read"]); }, 200); // after the exit animation
  }
  async function submit(e: FormEvent) {
    e.preventDefault();
    const r = await run(() => api<NewAgentToken>(`/api/repos/${repo.id}/agent-tokens`, { method: "POST", body: { name: name.trim(), scopes } }));
    if (r) {
      setMade(r);
      onCreated();
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={close}
      className={made ? "sm:max-w-2xl" : undefined}
      title={made ? "Token created" : "Create agent token"}
      description={made ? "Copy it now. It will not be shown again." : "Name it after the agent."}
      footer={
        made ? (
          <Button onClick={() => close(false)}>Done</Button>
        ) : (
          <>
            <Button variant="outline" onClick={() => close(false)}>Cancel</Button>
            <Button type="submit" form="new-agent-token" loading={busy} disabled={!name.trim() || !scopes.length}>Create token</Button>
          </>
        )
      }
    >
      {made ? (
        <div className="flex flex-col gap-5">
          <div className="flex items-center gap-3 rounded-lg border py-1.5 pr-1.5 pl-3">
            <code className="min-w-0 flex-1 font-mono text-[13px] break-all">{made.token}</code>
            <CopyButton value={made.token} />
          </div>
          <Connect url={url} token={made.token} />
        </div>
      ) : (
        <form id="new-agent-token" onSubmit={submit} className="flex flex-col gap-5">
          <Field label="Name" htmlFor="agent-name" hint="It shows in the activity log as agent:name.">
            <Input id="agent-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={100} placeholder="claude-code" autoComplete="off" />
          </Field>
          <fieldset className="flex flex-col gap-2.5">
            <legend className="mb-2 text-[13px] font-medium">Access</legend>
            {SCOPES.map((s) => (
              <label key={s.id} className="flex cursor-pointer items-start gap-2.5 text-sm">
                <Checkbox
                  className="mt-0.5"
                  checked={scopes.includes(s.id)}
                  onCheckedChange={(on) => setScopes((cur) => (on ? [...cur, s.id] : cur.filter((x) => x !== s.id)))}
                />
                <span><span className="font-medium">{s.label}</span><span className="text-muted-foreground"> · {s.hint}</span></span>
              </label>
            ))}
          </fieldset>
          {write && (
            <Notice tone="warning" title="Write lets the agent change your queue">
              It follows the same rules as you, and every action is logged. Give it only to agents you trust.
            </Notice>
          )}
        </form>
      )}
    </Dialog>
  );
}
