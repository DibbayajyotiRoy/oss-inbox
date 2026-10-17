"use client";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { Badge, Bar, ErrorBox, Load } from "@/components/ui";
import { api } from "@/lib/api";
import { pct, repoPath, when } from "@/lib/fmt";
import type { Decision, ItemDetail, Repo } from "@/lib/types";
import { useAction, useApi } from "@/lib/use-api";

const outcomeTone = { acted: "ok", queued: "warn", shadow: "info", skipped: "neutral", pending: "neutral" } as const;

export default function ItemPage() {
  const { itemId } = useParams<{ itemId: string }>();
  const res = useApi<ItemDetail>(`/api/items/${itemId}`);
  return <Load res={res}>{(d) => <Detail d={d} reload={res.reload} />}</Load>;
}

function Detail({ d, reload }: { d: ItemDetail; reload: () => void }) {
  const { item } = d;
  const repo = useApi<Repo>(`/api/repos/${item.repo_id}`);
  const canAct = repo.data ? repo.data.role !== "viewer" : false;
  const qOf = new Map(d.runs.flatMap((r) => r.decisions.map((x) => [x.id, x.question_id] as const)));
  return (
    <>
      <p className="text-xs"><Link href={repoPath(item.repo_id)}>← {repo.data?.full_name ?? "Repository"} queue</Link></p>
      <h1 className="text-lg font-semibold">{item.title}</h1>
      <p className="mb-4 text-sm text-muted">
        {item.kind}{item.number ? ` #${item.number}` : ""} · {item.state} · {item.author ?? "unknown author"} · {when(item.created_at)}
        {item.html_url && <> · <a href={item.html_url} target="_blank" rel="noreferrer">Open on GitHub ↗</a></>}
      </p>

      <h2 className="mb-2 font-semibold">Runs ({d.runs.length})</h2>
      {d.runs.length === 0 && <p className="note">Jev has not evaluated this item yet. Runs appear after the first webhook or backfill pass.</p>}
      <div className="space-y-4">
        {d.runs.map((r) => (
          <section key={r.id} className="card" aria-label={`Run ${r.id}`}>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <b>Run #{r.id}</b>
              <Badge>{r.trigger}</Badge>
              <span className="text-xs text-muted">{when(r.created_at)}</span>
              {!r.calibrated && <Badge tone="warn" title="Probabilities from this backend are not calibrated">⚠ uncalibrated</Badge>}
            </div>
            <p className="mt-1 font-mono text-xs text-muted">
              {r.backend} · {r.model_version} · {r.latency_ms} ms · {r.tokens_in} input tokens · ${r.cost_usd.toFixed(5)}
            </p>
            {r.error && <div role="alert" className="mt-2 rounded-md bg-bad-soft p-2 text-bad">Run failed: {r.error}</div>}
            <details className="mt-2">
              <summary className="min-h-8 cursor-pointer">Exact text Jev saw</summary>
              {r.state_text === null ? (
                <p className="text-muted">The text was purged after the retention period.</p>
              ) : (
                <pre className="mt-1 max-h-96 overflow-auto whitespace-pre-wrap rounded-md border border-line bg-surface p-2 font-mono text-xs">{r.state_text}</pre>
              )}
            </details>
            {r.decisions.map((x) => (
              <DecisionView key={x.id} x={x} overrides={d.overrides.filter((o) => o.decision_id === x.id)} canAct={canAct} reload={reload} />
            ))}
          </section>
        ))}
      </div>

      <h2 className="mb-2 mt-6 font-semibold">Actions taken</h2>
      {d.actions.length === 0 ? (
        <p className="note">Jev has not changed anything on GitHub for this item (shadow mode, queued, or not eligible).</p>
      ) : (
        <table>
          <thead><tr><th>When</th><th>Action</th><th>GitHub reference</th><th /></tr></thead>
          <tbody>
            {d.actions.map((a) => (
              <tr key={a.id}>
                <td>{when(a.created_at)}</td><td className="font-mono">{a.kind}</td><td className="font-mono">{a.github_ref ?? "—"}</td>
                <td>{a.dry_run && <Badge tone="warn" title="Dry-run: recorded only, nothing was written to GitHub">dry run</Badge>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <h2 className="mb-2 mt-6 font-semibold">Override history</h2>
      {d.overrides.length === 0 ? (
        <p className="note">No maintainer has overridden Jev on this item.</p>
      ) : (
        <table>
          <thead><tr><th>When</th><th>Who</th><th>Question</th><th>New answer</th></tr></thead>
          <tbody>
            {d.overrides.map((o) => (
              <tr key={o.id}><td>{when(o.created_at)}</td><td>{o.user}</td><td className="font-mono">{qOf.get(o.decision_id) ?? o.decision_id}</td><td>{o.new_answer}</td></tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}

function DecisionView({ x, overrides, canAct, reload }: { x: Decision; overrides: ItemDetail["overrides"]; canAct: boolean; reload: () => void }) {
  const opts = Object.entries(x.probabilities).sort((a, b) => b[1] - a[1]);
  const [answer, setAnswer] = useState(x.answer);
  const act = useAction();
  const last = overrides.at(-1);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (await act.run(() => api(`/api/decisions/${x.id}/override`, { method: "POST", body: { answer } }))) reload();
  }
  return (
    <div className="mt-3 rounded-md border border-line p-2">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-mono text-sm">{x.question_id}</span>
        <Badge tone={outcomeTone[x.outcome as keyof typeof outcomeTone] ?? "neutral"}>{x.outcome}</Badge>
        <span className="text-sm">answer <b>{x.answer}</b> · confidence {pct(x.confidence, 1)} · threshold {pct(x.threshold)} · {x.confidence >= x.threshold ? "above" : "below"} threshold</span>
        {last && <Badge tone="info">overridden to {last.new_answer} by {last.user}</Badge>}
      </div>
      <ul className="mt-1 space-y-0.5">
        {opts.map(([o, p]) => (
          <li key={o} className="flex items-center gap-2">
            <span className={`w-32 shrink-0 truncate ${o === x.answer ? "font-semibold" : ""}`}>{o}</span>
            <span className="flex-1"><Bar p={p} marker={x.threshold} tone={o === x.answer ? "ok" : "info"} /></span>
          </li>
        ))}
      </ul>
      <p className="text-xs text-muted">The black tick marks the {pct(x.threshold)} threshold the chosen answer needed to reach.</p>
      <form onSubmit={submit} className="mt-2 flex flex-wrap items-center gap-2">
        <label className="text-sm" htmlFor={`ov-${x.id}`}>Override answer</label>
        <select id={`ov-${x.id}`} className="input" value={answer} onChange={(e) => setAnswer(e.target.value)} disabled={!canAct}>
          {opts.map(([o]) => <option key={o}>{o}</option>)}
        </select>
        <button className="btn" disabled={!canAct || act.busy || answer === (last?.new_answer ?? x.answer)}>{act.busy ? "Saving…" : "Override"}</button>
        {!canAct && <span className="text-xs text-muted">Maintainer access required.</span>}
      </form>
      {act.error && <div className="mt-2"><ErrorBox error={act.error} /></div>}
    </div>
  );
}
