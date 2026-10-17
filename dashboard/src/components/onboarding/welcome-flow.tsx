"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ExternalLink, FlaskConical, TriangleAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CodeBlock } from "@/components/ui/code-block";
import { EmptyState } from "@/components/ui/empty-state";
import { Field } from "@/components/ui/field";
import { ErrorState } from "@/components/ui/load";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Status } from "@/components/ui/status";
import { api, errText } from "@/lib/api";
import type { Me, Overview } from "@/lib/types";
import type { SetupStatus } from "@/lib/types-onboarding";
import { useApi } from "@/lib/use-api";
import { cn } from "@/lib/utils";
import { Continue, Flow, FlowError, FlowSkeleton, Primary, useInterval } from "./flow";
import { Notice, Rows } from "./parts";

const RESTART = "docker compose restart api worker";
const PERMISSIONS = [
  ["Issues", "Read & write", "Apply labels to issues"],
  ["Pull requests", "Read & write", "Apply labels to pull requests"],
  ["Checks", "Read & write", "Report the CI gate"],
  ["Contents", "Read", "Read your config and contributing rules"],
  ["Metadata", "Read", "List your repositories"],
] as const;

/** Instance setup (GET /api/setup/status): key, GitHub App, install, first repository. Resumes at the first step not done. */
export function WelcomeFlow() {
  const status = useApi<SetupStatus>("/api/setup/status");
  const s = status.data;
  const settled = !!s && (s.demo_mode || (s.decision_key_present && s.app_configured && s.installations > 0));
  // Keys and installs change outside this page (a restart, a click on GitHub): look again until all three hold.
  useInterval(status.reload, s && !settled ? 3000 : null);

  if (!s) return status.error ? <FlowError error={status.error} retry={status.reload} /> : <FlowSkeleton />;
  const initial = s.demo_mode ? 3 : !s.decision_key_present ? 0 : !s.app_configured ? 1 : s.installations === 0 ? 2 : 3;
  return (
    <Flow
      initial={initial}
      right={
        s.demo_mode ? (
          <Button asChild variant="outline" size="sm">
            <a href="/api/auth/login">
              <FlaskConical />
              Open sample data
            </a>
          </Button>
        ) : (
          <Button asChild variant="ghost" size="sm">
            <Link href="/login">Sign in</Link>
          </Button>
        )
      }
      steps={[
        { id: "key", title: "Add your decision key", subtitle: "Every decision comes from this key.", skip: s.decision_key_present ? undefined : "Skip for now", body: <KeyStep s={s} /> },
        { id: "app", title: "Create the GitHub App", subtitle: "Private to you, with minimum access.", body: <AppStep s={s} /> },
        { id: "install", title: "Install it on your repos", subtitle: "Choose the repositories to triage.", body: <InstallStep s={s} /> },
        { id: "pick", title: "Pick a repository", subtitle: "Start with one. Add more later.", body: <PickStep demo={s.demo_mode} /> },
      ]}
    />
  );
}

function KeyStep({ s }: { s: SetupStatus }) {
  const jev = s.decision_backend === "jev";
  const env = jev ? "TYPESAFE_API_KEY" : "ANTHROPIC_API_KEY";
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <Status tone={s.decision_key_present ? "success" : "waiting"} className="text-sm">
          {s.decision_key_present ? `Key found (${env})` : `No ${env} yet`}
        </Status>
        <p className="text-sm text-muted-foreground">
          Backend <span className="font-mono text-foreground">{s.decision_backend}</span>, model <span className="font-mono text-foreground">{s.model}</span>
        </p>
      </div>

      {s.decision_key_present ? null : (
        <div className="flex flex-col gap-3">
          <p className="text-sm">Add this line to your .env file.</p>
          <CodeBlock filename=".env" code={`${env}=your_key`} />
          <p className="mt-1 text-sm">Then restart so the API reads it.</p>
          <CodeBlock code={RESTART} />
          <Button asChild variant="outline" size="sm" className="self-start">
            <a href={jev ? "https://docs.typesafe.ai" : "https://console.anthropic.com/settings/keys"} target="_blank" rel="noreferrer">
              Get a key
              <ExternalLink />
            </a>
          </Button>
        </div>
      )}

      {s.calibrated ? (
        <Status tone="success" className="text-sm">
          Calibrated: confidences are measured probabilities
        </Status>
      ) : (
        <Notice tone="warning" icon={TriangleAlert} title="Uncalibrated">
          Claude reports its own confidence, not a measured one. A 90% answer can be right far less often. Everything starts in shadow mode, and
          the backfill measures the real accuracy.
        </Notice>
      )}

      {s.decision_key_present ? <Continue /> : <Primary disabled>Waiting for the key</Primary>}
    </div>
  );
}

function AppStep({ s }: { s: SetupStatus }) {
  const [org, setOrg] = useState("");
  const bad = org !== "" && !/^[A-Za-z0-9-]{1,39}$/.test(org);
  if (s.demo_mode)
    return (
      <div className="flex flex-col gap-6">
        <Notice title="Demo mode">Sample data is loaded, so no GitHub App is needed. Nothing is written to GitHub.</Notice>
        <Continue />
      </div>
    );
  if (s.app_configured)
    return (
      <div className="flex flex-col gap-6">
        <Status tone="success" className="text-sm">
          GitHub App created{s.app_slug ? `: ${s.app_slug}` : ""}
        </Status>
        <Continue />
      </div>
    );
  return (
    <div className="flex flex-col gap-6">
      <Rows label="Permissions the app asks for">
        {PERMISSIONS.map(([name, access, why]) => (
          <li key={name} className="flex items-center gap-3 px-4 py-2.5 text-sm">
            <span className="w-28 shrink-0 font-medium">{name}</span>
            <Badge variant="outline">{access}</Badge>
            <span className="min-w-0 flex-1 truncate text-right text-muted-foreground max-sm:hidden">{why}</span>
          </li>
        ))}
      </Rows>
      <p className="-mt-3 text-[13px] text-muted-foreground">It never closes, deletes or locks anything, and it cannot write to your code.</p>

      <Field label="GitHub organization" htmlFor="org" error={bad ? "Letters, numbers and hyphens only" : null} hint="Leave empty to create it on your own account.">
        <Input id="org" data-enter-continues value={org} onChange={(e) => setOrg(e.target.value.trim())} placeholder="my-org" autoComplete="off" spellCheck={false} aria-invalid={bad} aria-describedby="org-desc" />
      </Field>

      {bad ? (
        <Primary disabled>Create GitHub App</Primary>
      ) : (
        <Primary asChild>
          <a href={`${s.setup_url ?? "/api/setup"}${org ? `?org=${encodeURIComponent(org)}` : ""}`}>
            Create GitHub App
            <ExternalLink />
          </a>
        </Primary>
      )}

      <div className="flex flex-col gap-2">
        <p className="text-[13px] text-muted-foreground">Already created it? Restart so the API reads the new credentials.</p>
        <CodeBlock code={RESTART} />
      </div>
    </div>
  );
}

function InstallStep({ s }: { s: SetupStatus }) {
  const n = s.installations;
  if (s.demo_mode || n > 0)
    return (
      <div className="flex flex-col gap-6">
        <Status tone="success" className="text-sm">
          {s.demo_mode ? "Sample organization loaded" : `Installed on ${n} ${n === 1 ? "account" : "accounts"}`}
        </Status>
        <Continue />
      </div>
    );
  if (!s.app_configured || !s.install_url)
    return (
      <div className="flex flex-col gap-6">
        <Notice title="Create the app first">The install link appears once the GitHub App exists and the API has restarted.</Notice>
        <Primary disabled>Install on GitHub</Primary>
      </div>
    );
  return (
    <div className="flex flex-col gap-6">
      <p className="text-sm text-muted-foreground">GitHub opens in a new tab. Select the repositories to triage, then come back here.</p>
      <div role="status" className="flex flex-col gap-1 rounded-lg border bg-muted/30 p-4">
        <Status tone="progress" className="text-sm">
          Waiting for the install
        </Status>
        <p className="text-[13px] text-muted-foreground">This page updates by itself.</p>
      </div>
      <Primary onClick={() => window.open(s.install_url!, "_blank", "noopener")}>
        Install on GitHub
        <ExternalLink />
      </Primary>
    </div>
  );
}

type Orgs = { all?: Overview[]; signedOut?: boolean; error?: Error };

function PickStep({ demo }: { demo: boolean }) {
  const router = useRouter();
  const [state, setState] = useState<Orgs>({});
  const [again, setAgain] = useState(0);
  const [sel, setSel] = useState<number>();
  useEffect(() => {
    let live = true;
    // fetch, not api(): a signed-out visitor should see a sign-in button, not be thrown to /login mid-flow.
    (async () => {
      const r = await fetch("/api/me", { credentials: "include" });
      if (r.status === 401) return live && setState({ signedOut: true });
      if (!r.ok) throw new Error(`Could not load your account (${r.status})`);
      const me: Me = await r.json();
      const all = await Promise.all(me.orgs.map((o) => api<Overview>(`/api/orgs/${o.id}/overview`)));
      if (live) setState({ all });
    })().catch((error) => live && setState({ error: error instanceof Error ? error : new Error(errText(error)) }));
    return () => {
      live = false;
    };
  }, [again]);

  if (state.error) return <ErrorState error={state.error} retry={() => {
          setState({});
          setAgain((n) => n + 1);
        }} />;
  if (state.signedOut)
    return (
      <div className="flex flex-col gap-6">
        <p className="text-sm text-muted-foreground">{demo ? "Open the sample organization to pick a repository." : "Sign in with GitHub to see the repositories the app can reach."}</p>
        <Primary asChild>
          <a href="/api/auth/login">{demo ? "Open sample data" : "Sign in with GitHub"}</a>
        </Primary>
      </div>
    );
  if (!state.all)
    return (
      <div role="status" aria-busy="true" className="flex flex-col gap-2">
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-12 w-full" />
        <span className="sr-only">Loading repositories</span>
      </div>
    );

  const repos = state.all.flatMap((o) => o.repos);
  if (repos.length === 0)
    return (
      <EmptyState
        art="inbox"
        title="No repositories yet"
        description="Add repositories to the installation on GitHub, then reload."
        action={
          <Button asChild variant="outline" size="sm">
            <Link href="/">Open dashboard</Link>
          </Button>
        }
      />
    );
  const chosen = repos.find((r) => r.id === sel) ?? repos.find((r) => !r.enabled) ?? repos[0];
  return (
    <div className="flex flex-col gap-6">
      <Rows label="Repositories" className="max-h-[50dvh] overflow-y-auto">
        {repos.map((r) => (
          <li key={r.id}>
            <label className="flex min-h-12 cursor-pointer items-center gap-3 px-4 py-2.5 text-sm has-[:checked]:bg-accent has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring has-[:focus-visible]:ring-inset hover:bg-accent/50">
              <input type="radio" name="repo" className="peer sr-only" checked={r.id === chosen.id} onChange={() => setSel(r.id)} />
              <span aria-hidden className="grid size-4 shrink-0 place-items-center rounded-full border border-input peer-checked:border-foreground">
                <span className={cn("size-2 rounded-full bg-foreground motion-safe:transition-transform motion-safe:duration-150 motion-safe:ease-settle", r.id === chosen.id ? "scale-100" : "scale-0")} />
              </span>
              <span className="min-w-0 flex-1 truncate font-medium">{r.full_name}</span>
              {r.private ? <Badge variant="outline">Private</Badge> : null}
              <Status tone={r.enabled ? "success" : "waiting"}>{r.enabled ? "Enabled" : "Not set up"}</Status>
            </label>
          </li>
        ))}
      </Rows>
      <Primary onClick={() => router.push(`/onboarding/${chosen.id}`)}>Set up {chosen.full_name.split("/")[1]}</Primary>
    </div>
  );
}
