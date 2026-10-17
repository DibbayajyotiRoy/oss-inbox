"use client";
import Link from "next/link";
import { Reliability } from "@/components/charts";
import { useRepo } from "@/components/repo";
import { Empty, Load } from "@/components/ui";
import { pct, repoPath } from "@/lib/fmt";
import type { Calibration } from "@/lib/types";
import { useApi } from "@/lib/use-api";

export default function CalibrationPage() {
  const { repo } = useRepo();
  if (repo.questions.length === 0)
    return <Empty title="No questions yet">Calibration charts appear once Jev has processed items for at least one feature.</Empty>;
  return (
    <>
      <p className="note mb-3">
        Does 80% confidence really mean right 8 times in 10? Each dot is a confidence bucket: height is the measured accuracy, size is how many
        decisions it holds. Dots on the dashed diagonal are calibrated; below it, Jev is overconfident. Click a dot to see its misses.
      </p>
      <ul className="grid gap-3 lg:grid-cols-2">
        {repo.questions.map((q) => (
          <li key={q.id} className="card">
            <Card repoId={repo.id} qid={q.id} />
          </li>
        ))}
      </ul>
    </>
  );
}

function Card({ repoId, qid }: { repoId: number; qid: string }) {
  const res = useApi<Calibration>(`/api/repos/${repoId}/calibration?question_id=${encodeURIComponent(qid)}`);
  return (
    <>
      <h2 className="font-mono font-medium">{qid}</h2>
      <Load
        res={res}
        isEmpty={(d) => d.n === 0}
        empty={<p className="mt-1 text-muted">Not measured yet (n=0). Resolve queue items or run a backfill to create ground truth.</p>}
      >
        {(d) => (
          <>
            <p className="text-sm text-muted">
              n={d.n} · ECE {d.ece === null ? "—" : d.ece.toFixed(3)} (average gap between confidence and accuracy; lower is better)
            </p>
            <div className="grid items-start gap-3 sm:grid-cols-[auto_1fr]">
              <Reliability bins={d.bins} href={(b) => `${repoPath(repoId, "evaluation")}?q=${encodeURIComponent(qid)}&lo=${b.lo}&hi=${b.hi}`} />
              <table className="text-xs">
                <thead><tr><th>Bucket</th><th>n</th><th>Conf.</th><th>Acc.</th><th>Gap</th></tr></thead>
                <tbody>
                  {d.bins.map((b) => (
                    <tr key={b.lo} className="whitespace-nowrap">
                      <td>
                        {b.n > 0 ? <Link href={`${repoPath(repoId, "evaluation")}?q=${encodeURIComponent(qid)}&lo=${b.lo}&hi=${b.hi}`}>{b.lo}–{b.hi}</Link> : `${b.lo}–${b.hi}`}
                      </td>
                      <td className="tabular-nums">{b.n}</td>
                      <td className="tabular-nums">{b.n ? pct(b.mean_confidence) : "—"}</td>
                      <td className="tabular-nums">{b.n ? pct(b.accuracy) : "—"}</td>
                      <td className="tabular-nums">{b.n ? `${b.accuracy >= b.mean_confidence ? "+" : "−"}${Math.abs((b.accuracy - b.mean_confidence) * 100).toFixed(0)} pts` : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </Load>
    </>
  );
}
