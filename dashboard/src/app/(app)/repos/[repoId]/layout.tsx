"use client";
import Link from "next/link";
import { useParams, usePathname } from "next/navigation";
import { Suspense } from "react";
import { RepoProvider } from "@/components/repo";
import { Badge, Load } from "@/components/ui";
import { repoPath } from "@/lib/fmt";
import type { Mode, Repo } from "@/lib/types";
import { useApi } from "@/lib/use-api";

const tabs = [
  ["queue", "Queue"], ["held", "Held"], ["thresholds", "Thresholds"], ["calibration", "Calibration"],
  ["evaluation", "Evaluation"], ["ci-gate", "CI gate"], ["flaky", "Flaky tests"], ["settings", "Settings"],
] as const;
const modeTone: Record<Mode, "neutral" | "info" | "ok"> = { off: "neutral", shadow: "info", auto: "ok" };

export default function RepoLayout({ children }: LayoutProps<"/repos/[repoId]">) {
  const { repoId } = useParams<{ repoId: string }>();
  const path = usePathname();
  const res = useApi<Repo>(`/api/repos/${repoId}`);
  return (
    <Load res={res}>
      {(repo) => (
        <RepoProvider value={{ repo, reload: res.reload }}>
          <div className="mb-3">
            <Link href="/" className="text-xs">← All repositories</Link>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-lg font-semibold">{repo.full_name}</h1>
              {repo.private && <Badge>Private</Badge>}
              {!repo.enabled && <Badge tone="warn">Disabled</Badge>}
              <Badge title="Your role on this repository">{repo.role}</Badge>
              <span className="text-xs text-muted">{repo.backend} · {repo.model}</span>
              {!repo.calibrated && (
                <Badge tone="warn" title="This backend does not return calibrated probabilities. Confidence is a ranking, not a probability: rely on measured accuracy, not on thresholds alone.">
                  ⚠ Uncalibrated backend
                </Badge>
              )}
            </div>
            <ul className="mt-1.5 flex flex-wrap gap-1.5" aria-label="Feature modes">
              {Object.entries(repo.features).map(([f, m]) => (
                <li key={f}><Badge tone={modeTone[m]} title={`${f} is ${m}`}>{f}: {m}</Badge></li>
              ))}
            </ul>
            {!repo.enabled && (
              <p className="note mt-2">Jev is not processing events for this repository. {repo.role === "admin" ? <Link href={repoPath(repo.id, "settings")}>Enable it in Settings.</Link> : "An admin can enable it in Settings."}</p>
            )}
          </div>
          <nav aria-label="Repository" className="mb-4 overflow-x-auto border-b border-line">
            <ul className="flex gap-1">
              {tabs.map(([seg, label]) => {
                const href = repoPath(repo.id, seg);
                const on = path === href;
                return (
                  <li key={seg}>
                    <Link href={href} aria-current={on ? "page" : undefined}
                      className={`-mb-px inline-flex min-h-9 items-center whitespace-nowrap border-b-2 px-3 text-fg no-underline max-sm:min-h-11 ${on ? "border-accent font-semibold" : "border-transparent text-muted hover:text-fg"}`}>
                      {label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>
          <Suspense fallback={<p className="py-8 text-center text-muted" role="status">Loading…</p>}>{children}</Suspense>
        </RepoProvider>
      )}
    </Load>
  );
}
