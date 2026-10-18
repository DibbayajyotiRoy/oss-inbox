"use client";
import { useRepo } from "@/components/repo";
import { CardSection } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Load, LoadMore } from "@/components/ui/load";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { when } from "@/lib/fmt";
import type { AuditRow } from "@/lib/types";
import { usePaged } from "@/lib/use-api";
import { RowsSkeleton } from "./parts";

/** What each logged action means, in plain words (an unknown one prints as it is). */
const ACTION: Record<string, string> = {
  "queue.accept": "Accepted answers",
  "queue.dismiss": "Dismissed an item",
  "queue.release": "Let a held item through",
  "decision.override": "Changed an answer",
  "backfill.queue": "Started a check on past issues",
  "ci_token.create": "Created a CI token",
  "ci_token.revoke": "Revoked a CI token",
  "labels.sync": "Created labels",
  "repo.enable": "Turned Jev on",
  "repo.disable": "Turned Jev off",
};

const detail = (d: unknown) =>
  d && typeof d === "object" ? Object.entries(d).map(([k, v]) => `${k}: ${typeof v === "string" ? v : JSON.stringify(v)}`).join(", ") : "";

export function Audit() {
  const { canAct } = useRepo();
  return (
    <CardSection title="Activity log" description="Who changed what, newest first.">
      {canAct ? <Rows /> : <EmptyState title="Only maintainers see this log" description="Ask a maintainer for access." />}
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
      empty={<EmptyState title="Nothing logged yet" description="Changes to settings, tokens and labels appear here." />}
    >
      {(rows) => (
        <>
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Who</TableHead>
                <TableHead>What</TableHead>
                <TableHead className="max-sm:hidden">On</TableHead>
                <TableHead className="text-right">When</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-medium">{r.actor}</TableCell>
                  <TableCell>
                    <span className="text-[13px]" title={r.action}>{ACTION[r.action] ?? r.action}</span>
                    {detail(r.details) && (
                      <span className="block max-w-[min(26rem,40vw)] max-sm:max-w-28 truncate font-mono text-xs text-muted-foreground" title={detail(r.details)}>
                        {detail(r.details)}
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="max-w-32 truncate text-muted-foreground max-sm:hidden">{r.target ?? "–"}</TableCell>
                  <TableCell className="text-right text-muted-foreground tabular-nums">
                    <time dateTime={r.created_at}>{when(r.created_at)}</time>
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
