"use client";
import Link from "next/link";
import { useRepo } from "@/components/repo";
import { Badge, Bar, Empty, ErrorBox, LoadMore } from "@/components/ui";
import { issueUrl, repoPath, when } from "@/lib/fmt";
import type { CiOutcome, CiReport } from "@/lib/types";
import { usePaged } from "@/lib/use-api";

const outcomes: Record<CiOutcome, [tone: "ok" | "info" | "warn" | "bad" | "neutral", help: string]> = {
  filed: ["ok", "A new issue was filed"],
  merged: ["info", "Matched an existing issue; merged into it"],
  flaky: ["warn", "Known flaky test; no issue filed"],
  infra: ["neutral", "Looked like an infrastructure failure"],
  queued: ["warn", "Not sure; waiting for a maintainer in the queue"],
  rate_limited: ["bad", "Hourly issue limit reached; not filed"],
  held: ["bad", "Looked security-sensitive; held, never filed publicly"],
};

export default function CiGate() {
  const { repo } = useRepo();
  const list = usePaged<CiReport>(`/api/repos/${repo.id}/ci-reports?limit=50`);
  if (list.error) return <ErrorBox error={list.error} retry={list.reload} />;
  if (list.data === undefined) return <p className="py-8 text-center text-muted" role="status" aria-busy="true">Loading…</p>;
  if (list.data.length === 0)
    return (
      <Empty title="No CI reports yet">
        When your CI posts a failure to <code>POST /api/v1/reports</code> with a token from Settings, Jev decides whether to file it, merge it into
        an existing issue, or ignore it as flaky or infrastructure noise, and each report shows up here with that outcome.
      </Empty>
    );
  return (
    <>
      <p className="mb-2 text-xs text-muted">
        {Object.entries(outcomes).map(([k, [, h]]) => <span key={k} className="mr-3 inline-block"><b>{k}</b>: {h}</span>)}
      </p>
      <ul className="space-y-2">
        {list.data.map((r) => {
          const [tone, help] = outcomes[r.outcome] ?? ["neutral", r.outcome];
          return (
            <li key={r.id} className="card">
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone={tone} title={help}>{r.outcome}</Badge>
                <b className="break-words">{r.title}</b>
                <span className="text-xs text-muted">{r.source} · {when(r.created_at)}</span>
              </div>
              <p className="mt-1 flex flex-wrap gap-x-4 text-sm">
                {r.issue_number !== null && <a href={issueUrl(repo.full_name, r.issue_number)} target="_blank" rel="noreferrer">Filed as #{r.issue_number} ↗</a>}
                {r.merged_into !== null && <a href={issueUrl(repo.full_name, r.merged_into)} target="_blank" rel="noreferrer">Merged into #{r.merged_into} ↗</a>}
                {r.run_url && <a href={r.run_url} target="_blank" rel="noreferrer">CI run ↗</a>}
                {r.outcome === "held" && <Link href={repoPath(repo.id, "held")}>Review in Held</Link>}
                {r.outcome === "queued" && <Link href={repoPath(repo.id, "queue")}>Review in Queue</Link>}
              </p>
              {r.candidates.length > 0 && (
                <details className="mt-1">
                  <summary className="min-h-8 cursor-pointer text-sm">{r.candidates.length} similar issue{r.candidates.length > 1 ? "s" : ""} considered</summary>
                  <table>
                    <thead><tr><th>Issue</th><th>Retrieval score</th><th>Jev: same problem?</th></tr></thead>
                    <tbody>
                      {r.candidates.map((c) => (
                        <tr key={c.item_id}>
                          <td><Link href={`/items/${c.item_id}`}>{c.number ? `#${c.number} ` : ""}{c.title}</Link></td>
                          <td className="font-mono tabular-nums">{c.retrieval_score.toFixed(3)}</td>
                          <td className="min-w-32">{c.same_as_probability === null ? <span className="text-muted">not asked</span> : <Bar p={c.same_as_probability} />}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </details>
              )}
            </li>
          );
        })}
      </ul>
      <LoadMore p={list} />
    </>
  );
}
