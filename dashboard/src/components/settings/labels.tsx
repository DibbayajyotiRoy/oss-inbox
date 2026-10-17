"use client";
import { useRepo } from "@/components/repo";
import { Button } from "@/components/ui/button";
import { CardSection } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Load } from "@/components/ui/load";
import { Status } from "@/components/ui/status";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "@/components/ui/toaster";
import { api } from "@/lib/api";
import { NEED, type LabelPlan } from "@/lib/types-settings";
import { useApi } from "@/lib/use-api";
import { Gate, RowsSkeleton, useRun } from "./parts";

/** mapping is {purpose: label} or {purpose: {variant: label}}: flatten to one row per configured label. */
const flatten = (m: LabelPlan["mapping"]) =>
  Object.entries(m).flatMap(([k, v]) => (typeof v === "string" ? [{ purpose: k, label: v }] : Object.entries(v).map(([s, label]) => ({ purpose: `${k}.${s}`, label }))));

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
      description="Configured labels versus GitHub."
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
        isEmpty={(d) => flatten(d.mapping).length === 0}
        empty={<EmptyState art="done" title="No labels configured" description="Add a labels section to your config." />}
      >
        {(plan) => {
          const gone = new Set(plan.missing.map((l) => l.toLowerCase()));
          const rows = flatten(plan.mapping)
            .map((r) => ({ ...r, missing: gone.has(r.label.toLowerCase()) }))
            .sort((a, b) => Number(b.missing) - Number(a.missing));
          return (
            <div className="flex flex-col gap-4">
              {plan.missing.length ? (
                <Status tone="warning"><span className="tabular-nums">{plan.missing.length}</span> missing on GitHub</Status>
              ) : (
                <Status tone="success">All configured labels exist</Status>
              )}
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead>Used for</TableHead>
                    <TableHead>Label</TableHead>
                    <TableHead className="text-right">On GitHub</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((r) => (
                    <TableRow key={r.purpose}>
                      <TableCell className="font-mono text-xs text-muted-foreground">{r.purpose}</TableCell>
                      <TableCell className="font-mono text-[13px]">{r.label}</TableCell>
                      <TableCell className="text-right">
                        {r.missing ? <Status tone="warning">Missing</Status> : <Status tone="success">Exists</Status>}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          );
        }}
      </Load>
    </CardSection>
  );
}
