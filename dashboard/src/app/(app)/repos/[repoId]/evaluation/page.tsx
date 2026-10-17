"use client";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { useRepo } from "@/components/repo";
import { Empty, ErrorBox, Load } from "@/components/ui";
import { api } from "@/lib/api";
import { pct, repoPath } from "@/lib/fmt";
import type { EvalQuestion, Evaluation } from "@/lib/types";
import { useAction, useApi } from "@/lib/use-api";

export default function EvaluationPage() {
  const { repo, canAct } = useRepo();
  const res = useApi<Evaluation>(`/api/repos/${repo.id}/evaluation`);
  const a = useAction();
  const [msg, setMsg] = useState<string>();
  const thresholds = new Map(repo.questions.map((q) => [q.id, q.threshold]));

  async function backfill() {
    if (await a.run(() => api(`/api/repos/${repo.id}/backfill`, { method: "POST" }))) {
      setMsg("Backfill queued. It runs in the background; use Refresh to see progress.");
      res.reload();
    }
  }

  return (
    <Load
      res={res}
      isEmpty={(d) => d.questions.length === 0}
      empty={
        <div className="space-y-3">
          <Empty title="Nothing to evaluate yet">
            Accuracy is measured by comparing Jev&apos;s answers with what maintainers actually decided. It appears after you resolve queue items or run
            a backfill over your closed issues and merged PRs.
          </Empty>
          {canAct && <button className="btn btn-primary" onClick={backfill} disabled={a.busy}>{a.busy ? "Queuing…" : "Run backfill"}</button>}
          {msg && <p role="status">{msg}</p>}
          {a.error && <ErrorBox error={a.error} />}
        </div>
      }
    >
      {(d) => (
        <>
          <div role="note" className="mb-3 rounded-md border border-warn/50 bg-warn-soft p-3 text-warn">
            <b>Upper bound, not a guarantee.</b> {d.upper_bound_note}
          </div>
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <button className="btn btn-primary" onClick={backfill} disabled={!canAct || a.busy}>{a.busy ? "Queuing…" : "Run backfill"}</button>
            <button className="btn" onClick={res.reload}>Refresh</button>
            <span className="text-sm text-muted">Backfill status: <b className="text-fg">{d.backfill_status ?? "never run"}</b></span>
            {!canAct && <span className="text-xs text-muted">Maintainer access required to run it.</span>}
          </div>
          <p role="status" className="text-sm">{msg}</p>
          {a.error && <ErrorBox error={a.error} />}
          <Detail d={d} repoId={repo.id} thresholds={thresholds} />
        </>
      )}
    </Load>
  );
}

function Detail({ d, repoId, thresholds }: { d: Evaluation; repoId: number; thresholds: Map<string, number> }) {
  const sp = useSearchParams();
  const sel: EvalQuestion | undefined = d.questions.find((x) => x.id === sp.get("q")) ?? d.questions.find((x) => x.n > 0) ?? d.questions[0];
  const here = (qs: string) => `${repoPath(repoId, "evaluation")}?${qs}`;
  return (
    <>
      <div className="overflow-x-auto">
        <table>
          <thead>
            <tr><th>Question</th><th>Accuracy</th><th>ECE</th><th>Current threshold</th><th>Recommended threshold</th></tr>
          </thead>
          <tbody>
            {d.questions.map((x) => (
              <tr key={x.id} className={x.id === sel?.id ? "bg-info-soft" : ""}>
                <td className="font-mono"><Link href={here(`q=${encodeURIComponent(x.id)}`)} aria-current={x.id === sel?.id || undefined}>{x.id}</Link></td>
                <td className="tabular-nums">{pct(x.accuracy, 1)} <span className="text-muted">n={x.n}</span></td>
                <td className="tabular-nums">{x.ece === null ? "—" : x.ece.toFixed(3)} <span className="text-muted">n={x.n}</span></td>
                <td className="tabular-nums">{pct(thresholds.get(x.id) ?? null)}</td>
                <td className="tabular-nums">
                  {x.recommended_threshold === null ? <span className="text-muted">not enough data (n={x.n})</span> : <>{pct(x.recommended_threshold)} <span className="text-muted">n={x.n}</span></>}
                  {x.recommended_threshold !== null && <> · <Link href={repoPath(repoId, "thresholds")}>adjust</Link></>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {sel && <Question x={sel} here={here} sp={sp} />}
    </>
  );
}

function Question({ x, here, sp }: { x: EvalQuestion; here: (qs: string) => string; sp: URLSearchParams }) {
  const num = (k: string) => (sp.get(k) === null ? undefined : Number(sp.get(k)));
  const lo = num("lo"), hi = num("hi"), truth = sp.get("truth"), answer = sp.get("answer");
  const filtered = lo !== undefined || hi !== undefined || truth !== null || answer !== null;
  const misses = x.worst_misses.filter(
    (m) => (lo === undefined || m.confidence >= lo) && (hi === undefined || hi >= 1 || m.confidence < hi) && (!truth || m.truth === truth) && (!answer || m.answer === answer),
  );
  const q = `q=${encodeURIComponent(x.id)}`;
  return (
    <section className="mt-6" aria-labelledby="qd">
      <h2 id="qd" className="font-mono font-semibold">{x.id} <span className="font-sans text-sm font-normal text-muted">n={x.n}</span></h2>

      <h3 className="mb-1 mt-3 font-medium">Confusion matrix</h3>
      {x.confusion === null ? (
        <p className="note">No confusion matrix yet: this question needs measured answers (n={x.n}).</p>
      ) : (
        <div className="overflow-x-auto">
          <p className="mb-1 text-xs text-muted">Rows: what maintainers decided. Columns: what Jev answered. Cell colour is the share of the row; the count is always printed. Click an error cell to see those items.</p>
          <table className="w-auto text-center">
            <thead>
              <tr><th className="text-left">truth ↓ / Jev →</th>{x.confusion.labels.map((l) => <th key={l} className="text-center">{l}</th>)}</tr>
            </thead>
            <tbody>
              {x.confusion.matrix.map((row, i) => {
                const sum = row.reduce((a, b) => a + b, 0);
                const tot = sum || 1;
                return (
                  <tr key={i}>
                    <th scope="row">{x.confusion!.labels[i]} <span className="font-normal">(n={sum})</span></th>
                    {row.map((c, j) => {
                      const right = i === j;
                      const bg = `color-mix(in srgb, var(${right ? "--ok" : "--bad"}) ${Math.round((c / tot) * 70)}%, transparent)`;
                      const labels = x.confusion!.labels;
                      return (
                        <td key={j} style={{ background: bg }} className="tabular-nums">
                          {c > 0 && !right ? (
                            <Link href={here(`${q}&truth=${encodeURIComponent(labels[i])}&answer=${encodeURIComponent(labels[j])}`)} title={`${c} times truth was ${labels[i]} and Jev said ${labels[j]}`}>{c}</Link>
                          ) : c}
                          <span className="block text-[10px] text-muted">{pct(c / tot)}</span>
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <h3 className="mb-1 mt-4 font-medium">Worst misses <span className="text-sm font-normal text-muted">(most confident wrong answers, up to {x.worst_misses.length})</span></h3>
      {filtered && (
        <p className="mb-2 text-sm">
          Filtered:{" "}
          {[
            lo !== undefined && <>confidence {lo}{hi !== undefined && hi < 1 ? `–${hi}` : "+"}</>,
            truth && <>truth <b>{truth}</b></>,
            answer && <>Jev said <b>{answer}</b></>,
          ].filter(Boolean).map((part, i) => <span key={i}>{i ? " · " : ""}{part}</span>)}
          {" "}(<Link href={here(q)}>clear filter</Link>)
        </p>
      )}
      {misses.length === 0 ? (
        <p className="note">{x.worst_misses.length === 0 ? "No wrong answers recorded for this question." : "None of the worst misses match this filter."}</p>
      ) : (
        <div className="overflow-x-auto">
          <table>
            <thead><tr><th>Item</th><th>Jev said</th><th>Truth</th><th>Confidence</th></tr></thead>
            <tbody>
              {misses.map((m) => (
                <tr key={m.item_id}>
                  <td>
                    <Link href={`/items/${m.item_id}`}>{m.number ? `#${m.number} ` : ""}{m.title}</Link>
                    {m.html_url && <> <a href={m.html_url} target="_blank" rel="noreferrer" aria-label="Open on GitHub">↗</a></>}
                  </td>
                  <td>{m.answer}</td><td>{m.truth}</td><td className="tabular-nums">{pct(m.confidence, 1)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
