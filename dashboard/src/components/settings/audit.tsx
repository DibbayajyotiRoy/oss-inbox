"use client";
import { useRepo } from "@/components/repo";
import { CardSection } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Load, LoadMore } from "@/components/ui/load";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { AuditRow } from "@/lib/types";
import { NEED } from "@/lib/types-settings";
import { usePaged } from "@/lib/use-api";
import { RowsSkeleton, stampParts } from "./parts";

const detail = (d: unknown) =>
  d && typeof d === "object" ? Object.entries(d).map(([k, v]) => `${k}: ${typeof v === "string" ? v : JSON.stringify(v)}`).join(", ") : "";

export function Audit() {
  const { canAct } = useRepo();
  return (
    <CardSection title="Audit log" description="Who changed what, newest first.">
      {canAct ? <Rows /> : <EmptyState title="Maintainers see the audit log" description={`${NEED.maintainer}.`} />}
    </CardSection>
  );
}

function Rows() {
  const { repo } = useRepo();
  const list = usePaged<AuditRow>(`/api/repos/${repo.id}/audit?limit=25`);
  return (
    <Load
      res={list}
      fallback={<RowsSkeleton rows={6} />}
      isEmpty={(d) => d.length === 0}
      empty={<EmptyState title="No audit entries yet" description="Enable, token and label changes appear here." />}
    >
      {(rows) => (
        <>
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Actor</TableHead>
                <TableHead>Action</TableHead>
                <TableHead className="max-sm:hidden">Target</TableHead>
                <TableHead className="text-right">When</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-medium">{r.actor}</TableCell>
                  <TableCell>
                    <span className="font-mono text-[13px]">{r.action}</span>
                    {detail(r.details) && (
                      <span className="block max-w-[min(26rem,40vw)] max-sm:max-w-28 truncate font-mono text-xs text-muted-foreground" title={detail(r.details)}>
                        {detail(r.details)}
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="max-w-32 truncate text-muted-foreground max-sm:hidden">{r.target ?? "—"}</TableCell>
                  <TableCell className="text-right text-muted-foreground tabular-nums">
                    {stampParts(r.created_at)[0]}
                    <span className="max-sm:hidden">, </span>
                    <span className="max-sm:block">{stampParts(r.created_at)[1]}</span>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <LoadMore list={list} />
        </>
      )}
    </Load>
  );
}
