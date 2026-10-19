"use client";
import { useState } from "react";
import { useRepo } from "@/components/repo";
import { useShell } from "@/components/shell/shell-context";
import { Button } from "@/components/ui/button";
import { CardSection } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Status } from "@/components/ui/status";
import { toast } from "@/components/ui/toaster";
import { api } from "@/lib/api";
import { NEED, type Repo } from "@/lib/types";
import { Confirm, Gate, useRun } from "./parts";

const SOURCE = { repo: "Repo file", org: "Org defaults", default: "Defaults" };

export function Repository() {
  const { repo, isAdmin, reload } = useRepo();
  const { reloadOverview } = useShell();
  const [ack, setAck] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const { busy, run } = useRun();

  async function set(enabled: boolean) {
    const r = await run(() =>
      api<Repo>(`/api/repos/${repo.id}`, { method: "PATCH", body: { enabled, acknowledge_private: enabled && repo.private ? ack : undefined } }),
    );
    if (!r) return;
    toast.success(enabled ? "OSS Inbox turned on" : "OSS Inbox turned off", { description: repo.full_name });
    setConfirming(false);
    setAck(false);
    reload();
    reloadOverview();
  }

  const rows: [string, React.ReactNode][] = [
    ["Status", repo.enabled ? <Status tone="success">On</Status> : <Status tone="neutral">Off</Status>],
    ["Visibility", repo.private ? "Private" : "Public"],
    ["Default branch", <span key="b" className="font-mono text-[13px]">{repo.default_branch}</span>],
    ["Model used", <span key="d" className="font-mono text-[13px]">{repo.backend} · {repo.model}</span>],
    ["Settings come from", SOURCE[repo.config_source]],
  ];
  const needsAck = repo.private && !repo.enabled;
  return (
    <CardSection
      title="Repository"
      description="Turn OSS Inbox on or off here."
      footer={
        repo.enabled ? (
          <Gate reason={!isAdmin && NEED.admin}>
            <Button variant="outline" className="text-destructive hover:text-destructive" onClick={() => setConfirming(true)}>Turn OSS Inbox off</Button>
          </Gate>
        ) : (
          <Gate reason={!isAdmin ? NEED.admin : needsAck && !ack && "Tick the box above first"}>
            <Button loading={busy} onClick={() => set(true)}>Turn OSS Inbox on</Button>
          </Gate>
        )
      }
    >
      <dl className="divide-y divide-border text-sm">
        {rows.map(([k, v]) => (
          <div key={k} className="grid grid-cols-[minmax(0,9rem)_minmax(0,1fr)] items-center gap-4 py-2.5 first:pt-0 last:pb-0">
            <dt className="text-muted-foreground">{k}</dt>
            <dd className="min-w-0">{v}</dd>
          </div>
        ))}
      </dl>
      {needsAck && (
        <label className="mt-5 flex cursor-pointer items-start gap-3 rounded-lg border p-4 text-sm">
          <Checkbox className="mt-0.5" checked={ack} disabled={!isAdmin} onCheckedChange={setAck} />
          <span>
            I understand that the text of issues and pull requests in this private repository will be sent to the model provider ({repo.backend}, model {repo.model}).
          </span>
        </label>
      )}
      <Confirm
        open={confirming}
        onOpenChange={setConfirming}
        title={`Turn OSS Inbox off on ${repo.full_name}?`}
        description="OSS Inbox stops reading new issues and pull requests. Existing decisions and history stay."
        label="Turn OSS Inbox off"
        busy={busy}
        onConfirm={() => set(false)}
      />
    </CardSection>
  );
}
