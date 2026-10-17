"use client";
import { useState } from "react";
import { useRepo } from "@/components/repo";
import { Badge, Copy, ErrorBox, Load, LoadMore } from "@/components/ui";
import { api } from "@/lib/api";
import { when } from "@/lib/fmt";
import type { AuditRow, CiToken, ConfigDoc, Mode, Rendered, Repo } from "@/lib/types";
import { useAction, useApi, usePaged } from "@/lib/use-api";

export default function Settings() {
  return (
    <div className="space-y-4">
      <Modes />
      <Config />
      <Labels />
      <Enable />
      <Tokens />
      <Audit />
    </div>
  );
}

const Section = ({ id, title, children }: { id: string; title: string; children: React.ReactNode }) => (
  <section className="card" aria-labelledby={id}>
    <h2 id={id} className="mb-2 font-semibold">{title}</h2>
    {children}
  </section>
);

const modeTone: Record<Mode, "neutral" | "info" | "ok"> = { off: "neutral", shadow: "info", auto: "ok" };
const modeHelp: Record<Mode, string> = {
  off: "does nothing",
  shadow: "records decisions and queues suggestions, never acts",
  auto: "acts on confident answers whose question has been measured",
};

function Modes() {
  const { repo } = useRepo();
  return (
    <Section id="modes" title="Feature modes">
      <ul className="space-y-1">
        {Object.entries(repo.features).map(([f, m]) => (
          <li key={f} className="flex flex-wrap items-center gap-2">
            <span className="w-32 font-mono">{f}</span><Badge tone={modeTone[m]}>{m}</Badge><span className="text-xs text-muted">{modeHelp[m]}</span>
          </li>
        ))}
      </ul>
      <p className="mt-2 text-sm text-muted">
        Modes live in the YAML below (<code>features.&lt;name&gt;.mode</code>), currently read from the <b>{repo.config_source}</b> config. Jev never
        edits your repository: change them in YAML and commit.
      </p>
    </Section>
  );
}

function Config() {
  const { repo } = useRepo();
  const res = useApi<ConfigDoc>(`/api/repos/${repo.id}/config`);
  return (
    <Section id="config" title="Configuration (.github/jev-triage.yml)">
      <Load res={res}>{(doc) => <ConfigBody doc={doc} repoId={repo.id} canAct={repo.role !== "viewer"} />}</Load>
    </Section>
  );
}

function ConfigBody({ doc, repoId, canAct }: { doc: ConfigDoc; repoId: number; canAct: boolean }) {
  const [text, setText] = useState(() => JSON.stringify(doc.parsed, null, 2));
  const [out, setOut] = useState<Rendered>();
  const a = useAction();
  const shown = out ?? { yaml: doc.yaml, edit_url: doc.edit_url, errors: [] };
  async function validate() {
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch (e) {
      return setOut({ yaml: doc.yaml, edit_url: doc.edit_url, errors: [`Not valid JSON: ${(e as Error).message}`] });
    }
    const r = await a.run(() => api<Rendered>(`/api/repos/${repoId}/config/render`, { method: "POST", body: { parsed } }));
    if (r) setOut(r);
  }
  return (
    <>
      <div className="grid gap-3 lg:grid-cols-2">
        <div>
          <label htmlFor="cfg" className="text-sm font-medium">Edit (parsed config as JSON, which is valid YAML)</label>
          <textarea id="cfg" value={text} onChange={(e) => setText(e.target.value)} spellCheck={false} rows={18}
            className="input mt-1 w-full py-1 font-mono text-xs" />
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <button className="btn btn-primary" onClick={validate} disabled={a.busy || !canAct}>{a.busy ? "Validating…" : "Validate"}</button>
            <button className="btn" onClick={() => { setText(JSON.stringify(doc.parsed, null, 2)); setOut(undefined); }}>Reset</button>
          </div>
        </div>
        <div>
          <p className="text-sm font-medium">{out ? "Rendered YAML to commit" : `Current YAML (${doc.source})`}</p>
          {shown.errors.length > 0 ? (
            <ul role="alert" className="mt-1 rounded-md bg-bad-soft p-2 text-bad">{shown.errors.map((e) => <li key={e}>{e}</li>)}</ul>
          ) : out ? (
            <p role="status" className="mt-1 text-ok">✓ Valid.</p>
          ) : null}
          <pre className="mt-1 max-h-96 overflow-auto rounded-md border border-line bg-surface p-2 font-mono text-xs">{shown.yaml}</pre>
          <div className="mt-2 flex flex-wrap gap-2">
            <a className="btn btn-primary" href={shown.edit_url} target="_blank" rel="noreferrer">Open in GitHub to commit ↗</a>
            <Copy text={shown.yaml} label="Copy YAML" />
          </div>
        </div>
      </div>
      {a.error && <div className="mt-2"><ErrorBox error={a.error} /></div>}
      <p className="mt-2 text-xs text-muted">The dashboard never writes to your repository. Commit the YAML on GitHub; Jev reloads it on the next push.</p>
    </>
  );
}

function Labels() {
  const { repo, canAct } = useRepo();
  const [created, setCreated] = useState<string[]>();
  const a = useAction();
  return (
    <Section id="labels" title="Labels">
      <p className="text-sm text-muted">Creates any labels named in your config that are missing on GitHub. Existing labels are left untouched.</p>
      <button className="btn mt-2" disabled={!canAct || a.busy}
        onClick={async () => setCreated((await a.run(() => api<{ created: string[] }>(`/api/repos/${repo.id}/labels/sync`, { method: "POST" })))?.created)}>
        {a.busy ? "Syncing…" : "Sync labels"}
      </button>
      {!canAct && <span className="ml-2 text-xs text-muted">Maintainer access required.</span>}
      <div role="status" aria-live="polite" className="mt-2">
        {created && (created.length ? <>Created {created.length}: {created.map((l) => <code key={l} className="mr-1 rounded bg-surface px-1">{l}</code>)}</> : "All configured labels already exist.")}
      </div>
      {a.error && <ErrorBox error={a.error} />}
    </Section>
  );
}

function Enable() {
  const { repo, isAdmin, reload } = useRepo();
  const [ack, setAck] = useState(false);
  const a = useAction();
  const needsAck = repo.private && !repo.enabled;
  const set = async (enabled: boolean) => {
    if (await a.run(() => api<Repo>(`/api/repos/${repo.id}`, { method: "PATCH", body: { enabled, acknowledge_private: enabled && repo.private ? ack : undefined } }))) reload();
  };
  return (
    <Section id="enable" title="Enable Jev on this repository">
      <p>Status: {repo.enabled ? <Badge tone="ok">Enabled</Badge> : <Badge tone="warn">Disabled</Badge>}</p>
      {repo.private && (
        <p className="mt-1 text-sm text-muted">
          This is a private repository. Its issue and PR text is sent to the decision backend (<b>{repo.backend}</b>, model {repo.model}) when enabled.
        </p>
      )}
      {needsAck && (
        <label className="mt-2 flex items-start gap-2">
          <input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} disabled={!isAdmin} className="mt-1 size-4" />
          <span>I understand that content from this private repository will be sent to the decision backend.</span>
        </label>
      )}
      <button className={`btn mt-2 ${repo.enabled ? "btn-danger" : "btn-primary"}`} disabled={!isAdmin || a.busy || (needsAck && !ack)} onClick={() => set(!repo.enabled)}>
        {a.busy ? "Saving…" : repo.enabled ? "Disable" : "Enable"}
      </button>
      {!isAdmin && <span className="ml-2 text-xs text-muted">Admin access required.</span>}
      {a.error && <ErrorBox error={a.error} />}
    </Section>
  );
}

function Tokens() {
  const { repo, isAdmin } = useRepo();
  const res = useApi<{ items: CiToken[] }>(`/api/repos/${repo.id}/ci-tokens`);
  const [name, setName] = useState("");
  const [fresh, setFresh] = useState<{ token: string; curl: string }>();
  const a = useAction();
  async function create(e: React.FormEvent) {
    e.preventDefault();
    const r = await a.run(() => api<{ id: number; name: string; token: string }>(`/api/repos/${repo.id}/ci-tokens`, { method: "POST", body: { name } }));
    if (!r) return;
    setName("");
    setFresh({
      token: r.token,
      curl: `curl -X POST ${location.origin}/api/v1/reports \\\n  -H "Authorization: Bearer ${r.token}" \\\n  -H "Content-Type: application/json" \\\n  -d '{"repo":"${repo.full_name}","title":"test_login failed on main","body":"<failure details>","failing_test":"tests/test_login.py::test_login","commit_sha":"<sha>","run_url":"<ci run url>","source":"ci"}'`,
    });
    res.reload();
  }
  async function revoke(t: CiToken) {
    if (confirm(`Revoke token "${t.name}"? CI jobs using it will stop working.`) && (await a.run(() => api(`/api/repos/${repo.id}/ci-tokens/${t.id}`, { method: "DELETE" })))) res.reload();
  }
  return (
    <Section id="tokens" title="CI tokens">
      <p className="text-sm text-muted">Tokens let your CI post failures to the CI gate. Only a hash is stored, so a token is shown once.</p>
      {fresh && (
        <div role="status" className="note mt-2 border-ok">
          <p className="font-medium">Copy your token now. It will not be shown again.</p>
          <div className="my-1 flex flex-wrap items-center gap-2"><code className="break-all">{fresh.token}</code><Copy text={fresh.token} label="Copy token" /></div>
          <p className="mt-2 text-xs text-muted">Example:</p>
          <pre className="overflow-auto rounded-md border border-line bg-bg p-2 font-mono text-xs">{fresh.curl}</pre>
          <div className="mt-1 flex gap-2"><Copy text={fresh.curl} label="Copy curl" /><button className="btn" onClick={() => setFresh(undefined)}>I saved it</button></div>
        </div>
      )}
      <form onSubmit={create} className="mt-2 flex flex-wrap items-end gap-2">
        <label className="text-sm">Token name<br />
          <input className="input mt-0.5" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. github-actions" required maxLength={80} disabled={!isAdmin} />
        </label>
        <button className="btn btn-primary" disabled={!isAdmin || a.busy || !name.trim()}>Create token</button>
        {!isAdmin && <span className="text-xs text-muted">Admin access required.</span>}
      </form>
      {a.error && <ErrorBox error={a.error} />}
      <div className="mt-3">
        <Load res={res} isEmpty={(d) => d.items.length === 0} empty={<p className="text-muted">No tokens yet. Create one to start sending CI failures.</p>}>
          {(d) => (
            <table>
              <thead><tr><th>Name</th><th>Created</th><th>Status</th><th /></tr></thead>
              <tbody>
                {d.items.map((t) => (
                  <tr key={t.id}>
                    <td>{t.name}</td><td>{when(t.created_at)} by {t.created_by}</td>
                    <td>{t.revoked_at ? <Badge tone="bad">revoked {when(t.revoked_at)}</Badge> : <Badge tone="ok">active</Badge>}</td>
                    <td>{!t.revoked_at && <button className="btn btn-danger" disabled={!isAdmin || a.busy} onClick={() => revoke(t)}>Revoke</button>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Load>
      </div>
    </Section>
  );
}

function Audit() {
  const { repo } = useRepo();
  const list = usePaged<AuditRow>(`/api/repos/${repo.id}/audit?limit=50`);
  return (
    <Section id="audit" title="Audit log">
      <Load res={list} isEmpty={(d) => d.length === 0} empty={<p className="text-muted">No audit entries yet. Config renders, token changes and enable/disable are recorded here.</p>}>
        {(rows) => (
          <>
            <div className="overflow-x-auto">
              <table>
                <thead><tr><th>When</th><th>Who</th><th>Action</th><th>Target</th><th>Details</th></tr></thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id}>
                      <td className="whitespace-nowrap">{when(r.created_at)}</td><td>{r.actor}</td><td className="font-mono">{r.action}</td><td>{r.target ?? "—"}</td>
                      <td className="max-w-xs truncate font-mono text-xs" title={JSON.stringify(r.details)}>{r.details == null ? "—" : JSON.stringify(r.details)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <LoadMore p={list} />
          </>
        )}
      </Load>
    </Section>
  );
}
