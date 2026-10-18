"use client";
import { useRepo } from "@/components/repo";
import { CardSection } from "@/components/ui/card";
import { DataTable } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/empty-state";
import { Load, LoadMore } from "@/components/ui/load";
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
          <DataTable
            label="Activity log"
            storageKey="settings-audit"
            rows={rows}
            rowKey={(r) => r.id}
            columns={[
              { key: "actor", header: "Who", cellClassName: "font-medium" },
              {
                key: "what",
                header: "What",
                cell: (r) => (
                  <>
                    <span className="text-[13px]" title={r.action}>{ACTION[r.action] ?? r.action}</span>
                    {detail(r.details) && (
                      <span className="block max-w-[min(26rem,40vw)] max-sm:max-w-28 truncate font-mono text-xs text-muted-foreground" title={detail(r.details)}>
                        {detail(r.details)}
                      </span>
                    )}
                  </>
                ),
              },
              { key: "target", header: "On", className: "max-sm:hidden", cellClassName: "max-w-32 truncate text-muted-foreground" },
              {
                key: "when",
                header: "When",
                align: "right",
                cellClassName: "text-muted-foreground tabular-nums",
                cell: (r) => <time dateTime={r.created_at}>{when(r.created_at)}</time>,
              },
            ]}
          />
          <LoadMore list={list} />
        </>
      )}
    </Load>
  );
}
