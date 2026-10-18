"use client";
import { useRepo } from "@/components/repo";
import { Button } from "@/components/ui/button";
import { CardSection } from "@/components/ui/card";
import { DataTable } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/empty-state";
import { Load } from "@/components/ui/load";
import { Status } from "@/components/ui/status";
import { toast } from "@/components/ui/toaster";
import { api } from "@/lib/api";
import { type LabelPlan, NEED, labelRows } from "@/lib/types";
import { useApi } from "@/lib/use-api";
import { Gate, RowsSkeleton, useRun } from "./parts";

export function Labels() {
  const { repo, canAct } = useRepo();
  const res = useApi<LabelPlan>(`/api/repos/${repo.id}/labels/plan`);
  const { busy, run } = useRun();
  const missing = res.data?.missing.length ?? 0;

  async function sync() {
    const r = await run(() => api<{ created: string[] }>(`/api/repos/${repo.id}/labels/sync`, { method: "POST" }));
    if (!r) return;
    toast.success(r.created.length ? `Created ${r.created.length} ${r.created.length === 1 ? "label" : "labels"}` : "All labels already exist", {
      description: r.created.join(", ") || undefined,
    });
    res.reload();
  }

  return (
    <CardSection
      title="Labels"
      description="Labels in your config and on GitHub."
      hint="Sync creates the labels your config names that are missing on GitHub. Existing labels are never changed."
      action={
        <Gate reason={!canAct ? NEED.maintainer : res.data ? missing === 0 && "Nothing to sync" : "Loading"}>
          <Button variant="outline" size="sm" loading={busy} onClick={sync}>Sync labels</Button>
        </Gate>
      }
    >
      <Load
        res={res}
        fallback={<RowsSkeleton rows={5} />}
        isEmpty={(d) => labelRows(d.mapping).length === 0}
        empty={<EmptyState art="done" title="No labels configured" description="Add a labels section to your config." />}
      >
        {(plan) => {
          const gone = new Set(plan.missing.map((l) => l.toLowerCase()));
          const rows = labelRows(plan.mapping)
            .map((r) => ({ ...r, missing: gone.has(r.label.toLowerCase()) }))
            .sort((a, b) => Number(b.missing) - Number(a.missing));
          return (
            <div className="flex flex-col gap-4">
              {plan.missing.length ? (
                <Status tone="warning"><span className="tabular-nums">{plan.missing.length}</span> missing on GitHub</Status>
              ) : (
                <Status tone="success">All configured labels exist</Status>
              )}
              <DataTable
                label="Labels"
                storageKey="settings-labels"
                rows={rows}
                rowKey={(r) => r.purpose}
                columns={[
                  { key: "purpose", header: "Used for", cellClassName: "font-mono text-xs text-muted-foreground" },
                  { key: "label", header: "Label", cellClassName: "font-mono text-[13px]" },
                  { key: "github", header: "On GitHub", align: "right", cell: (r) => (r.missing ? <Status tone="warning">Missing</Status> : <Status tone="success">Exists</Status>) },
                ]}
              />
            </div>
          );
        }}
      </Load>
    </CardSection>
  );
}
