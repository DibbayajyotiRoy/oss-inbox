"use client";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { Hist } from "@/components/charts";
import { useRepo } from "@/components/repo";
import { Badge, Copy, Empty, ErrorBox } from "@/components/ui";
import { api } from "@/lib/api";
import { pct, repoPath } from "@/lib/fmt";
import type { ConfigDoc, Preview, QuestionInfo, Rendered } from "@/lib/types";
import { useAction, useApi } from "@/lib/use-api";
import type { Counts, In } from "./preview.worker";

/** One shared worker, created lazily on first message. */
function usePreviewWorker() {
  const ref = useRef<Worker | null>(null);
  const [counts, setCounts] = useState<Record<string, Counts>>({});
  const post = useCallback((m: In) => {
    if (!ref.current) {
      ref.current = new Worker(new URL("./preview.worker.ts", import.meta.url));
      ref.current.onmessage = (e: MessageEvent<Counts>) => setCounts((c) => ({ ...c, [e.data.id]: e.data }));
    }
    ref.current.postMessage(m);
  }, []);
  useEffect(() => () => {
    ref.current?.terminate();
    ref.current = null;
  }, []);
  return { counts, post };
}

export default function Thresholds() {
  const { repo, canAct } = useRepo();
  const { counts, post } = usePreviewWorker();
  const [vals, setVals] = useState<Record<string, number>>({});
  const [out, setOut] = useState<Rendered>();
  const act = useAction();
  const changed = repo.questions.filter((q) => vals[q.id] !== undefined && vals[q.id] !== q.threshold);

  async function generate() {
    const r = await act.run(async () => {
      const cfg = await api<ConfigDoc>(`/api/repos/${repo.id}/config`);
      const thresholds = { ...(cfg.parsed.thresholds ?? {}) };
      for (const q of changed) {
        if (vals[q.id] === q.default_threshold) delete thresholds[q.id]; // equal to default: keep the YAML minimal
        else thresholds[q.id] = vals[q.id];
      }
      return api<Rendered>(`/api/repos/${repo.id}/config/render`, { method: "POST", body: { parsed: { ...cfg.parsed, thresholds } } });
    });
    if (r) setOut(r);
  }

  if (repo.questions.length === 0)
    return <Empty title="No questions yet">Questions appear once at least one feature is enabled in the repo config and has processed an item.</Empty>;
  return (
    <>
      <p className="note mb-3">
        Move a slider to see, on this repo&apos;s measured history, how many items Jev would handle on its own and how many of those it would get
        wrong. Jev never writes to your repository: changes become YAML you commit yourself.
      </p>
      <ul className="space-y-3">
        {repo.questions.map((q) => (
          <QRow key={q.id} q={q} repoId={repo.id} value={vals[q.id] ?? q.threshold} counts={counts[q.id]} post={post}
            onChange={(v) => setVals((s) => ({ ...s, [q.id]: v }))} />
        ))}
      </ul>

      <section className="card mt-4" aria-labelledby="gen">
        <h2 id="gen" className="font-semibold">Apply changes</h2>
        <p className="text-sm text-muted">
          {changed.length ? `${changed.length} threshold${changed.length > 1 ? "s" : ""} changed: ${changed.map((q) => q.id).join(", ")}.` : "No changes yet."}{" "}
          Jev only reads <code>.github/jev-triage.yml</code>; it never commits for you.
        </p>
        <button className="btn btn-primary mt-2" onClick={generate} disabled={act.busy || changed.length === 0 || !canAct}>
          {act.busy ? "Rendering…" : "Generate YAML"}
        </button>
        {!canAct && <span className="ml-2 text-xs text-muted">Maintainer access required.</span>}
        {act.error && <div className="mt-2"><ErrorBox error={act.error} /></div>}
        {out && (
          <div className="mt-3">
            {out.errors.length > 0 && (
              <ul role="alert" className="mb-2 rounded-md bg-bad-soft p-2 text-bad">{out.errors.map((e) => <li key={e}>{e}</li>)}</ul>
            )}
            <pre className="max-h-80 overflow-auto rounded-md border border-line bg-surface p-2 font-mono text-xs">{out.yaml}</pre>
            <div className="mt-2 flex flex-wrap gap-2">
              <a className="btn btn-primary" href={out.edit_url} target="_blank" rel="noreferrer">Open in GitHub to commit ↗</a>
              <Copy text={out.yaml} label="Copy YAML" />
            </div>
          </div>
        )}
      </section>
    </>
  );
}

function QRow({ q, repoId, value, counts, post, onChange }: {
  q: QuestionInfo; repoId: number; value: number; counts?: Counts; post: (m: In) => void; onChange: (v: number) => void;
}) {
  const prev = useApi<Preview>(`/api/repos/${repoId}/preview?question_id=${encodeURIComponent(q.id)}`);
  const pts = prev.data?.points;
  useEffect(() => {
    if (pts) post({ op: "load", id: q.id, points: pts });
  }, [pts, q.id, post]);
  useEffect(() => {
    if (pts) post({ op: "query", id: q.id, t: value });
  }, [pts, q.id, value, post]);

  const fresh = counts && counts.t === value ? counts : undefined;
  const measuredActed = fresh ? fresh.acted - fresh.unmeasured : 0;
  return (
    <li className="card">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-mono font-medium">{q.id}</span>
        <Badge>{q.feature}</Badge>
        <span className="text-xs text-muted">
          {q.measured ? `measured: accuracy ${pct(q.accuracy, 1)} on n=${q.n}` : `not measured yet (n=${q.n}) — auto mode will not act on it`}
        </span>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-3">
        <label htmlFor={`t-${q.id}`} className="text-sm">Threshold</label>
        <input id={`t-${q.id}`} type="range" min={0.5} max={0.99} step={0.01} value={value} className="min-w-40 flex-1 accent-(--accent) max-sm:h-8"
          onChange={(e) => onChange(Number(e.target.value))} />
        <output htmlFor={`t-${q.id}`} className="w-12 font-mono font-semibold">{pct(value)}</output>
        <span className="text-xs text-muted">default {pct(q.default_threshold)} · current {pct(q.threshold)}</span>
        {value !== q.threshold && <Badge tone="info">edited</Badge>}
        <button className="btn" onClick={() => onChange(q.threshold)} disabled={value === q.threshold}>Reset</button>
        <button className="btn" onClick={() => onChange(q.default_threshold)} disabled={value === q.default_threshold}>Default</button>
      </div>
      <div className="mt-2" aria-live="polite">
        {prev.error ? (
          <ErrorBox error={prev.error} retry={prev.reload} />
        ) : !prev.data ? (
          <p className="text-muted">Loading history…</p>
        ) : prev.data.points.length === 0 ? (
          <p className="text-muted">No history to preview yet. Resolve items in the queue or run a backfill on the Evaluation tab to measure this question.</p>
        ) : !fresh ? (
          <p className="text-muted">Calculating…</p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-[1fr_20rem]">
            <p>
              At {pct(value)}, of <b>{fresh.n}</b> past decisions: <b>{fresh.acted}</b> ({pct(fresh.acted / fresh.n)}) would be auto-acted,{" "}
              <Link href={repoPath(repoId, "queue")}><b>{fresh.queued}</b> queued</Link> for you.
              {" "}Among auto-acted ones with a known answer (n={measuredActed}), <b>{fresh.wrong}</b> would be wrong
              {measuredActed > 0 && <> (accuracy {pct(1 - fresh.wrong / measuredActed, 1)})</>}
              {fresh.wrong > 0 && <> — <Link href={`${repoPath(repoId, "evaluation")}?q=${encodeURIComponent(q.id)}&lo=${value}`}>see them</Link></>}.
              {fresh.unmeasured > 0 && <> {fresh.unmeasured} auto-acted have no known answer.</>}
            </p>
            <div>
              <Hist bins={fresh.bins} t={value} />
              <p className="text-xs text-muted"><span className="text-ok">■</span> correct <span className="text-bad">■</span> wrong <span>■</span> unmeasured · line = threshold</p>
            </div>
          </div>
        )}
      </div>
    </li>
  );
}
