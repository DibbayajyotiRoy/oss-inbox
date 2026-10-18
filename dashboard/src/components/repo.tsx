"use client";
import Link from "next/link";
import { useParams } from "next/navigation";
import { createContext, Suspense, useContext, type ReactNode } from "react";
import { ArrowRight, ChevronDown, Lock, TriangleAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { InfoHint } from "@/components/ui/info-hint";
import { MODE_LABEL, MODE_VARIANT, WAITING, autoReason } from "@/components/ui/mode-control";
import { Load } from "@/components/ui/load";
import { Notice } from "@/components/ui/notice";
import { Busy, Skeleton } from "@/components/ui/skeleton";
import { Status } from "@/components/ui/status";
import { repoPath } from "@/lib/fmt";
import { CONFIG_PATH, FEATURES, featureModes, type Repo } from "@/lib/types";
import { useApi } from "@/lib/use-api";

const Ctx = createContext<{ repo: Repo; reload: () => void } | null>(null);
export const RepoProvider = Ctx.Provider;
export function useRepo() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useRepo outside repo layout");
  return { ...c, canAct: c.repo.role !== "viewer", isAdmin: c.repo.role === "admin" };
}

/** Loads the repo in the URL (server data when the page shipped with it), then renders its identity strip and the page under it. */
export function RepoGate({ children }: { children: ReactNode }) {
  const { repoId } = useParams<{ repoId: string }>();
  const res = useApi<Repo>(`/api/repos/${repoId}`);
  return (
    <Load res={res} fallback={<RepoHeaderSkeleton />} errorTitle="Repository">
      {(repo) => (
        <RepoProvider value={{ repo, reload: res.reload }}>
          <RepoHeader repo={repo} />
          <Suspense fallback={<Busy><Skeleton className="h-64 w-full" /></Busy>}>{children}</Suspense>
        </RepoProvider>
      )}
    </Load>
  );
}

/** The only place this app links to onboarding. */
const onboardingHref = (id: number) => `/onboarding/${id}`;

/** Every lane and its mode in one chip ("7 lanes · 4 auto · 3 shadow"); the list behind it links to Settings. */
function Lanes({ repo }: { repo: Repo }) {
  const lanes = featureModes(repo).map(([f, m]) => ({ f, m: m === "auto" && autoReason(repo.questions.filter((q) => q.feature === f)) ? ("waiting" as const) : m }));
  const count = (m: string) => lanes.filter((l) => l.m === m).length;
  const parts = [`${lanes.length} lanes`, ...(["auto", "waiting", "shadow", "off"] as const).filter(count).map((m) => `${count(m)} ${m}`)];
  const waiting = count("waiting") > 0;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Badge asChild variant={waiting ? "warning" : "outline"} className="h-6 cursor-pointer font-mono">
          <button type="button">
            {waiting && <TriangleAlert aria-hidden />}
            {parts.join(" · ")}
            <ChevronDown aria-hidden />
          </button>
        </Badge>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-80">
        <DropdownMenuLabel>Lanes</DropdownMenuLabel>
        {lanes.map(({ f, m }) => (
          <DropdownMenuItem key={f} asChild>
            <Link href={`${repoPath(repo.id, "settings")}?s=automation`}>
              <span className="truncate">{FEATURES[f]?.name ?? f}</span>
              <Badge variant={m === "waiting" ? "warning" : MODE_VARIANT[m]} className="ml-auto">
                {m === "waiting" ? WAITING : MODE_LABEL[m]}
              </Badge>
            </Link>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** A compact identity strip, one line: name, backend, role and a lanes summary; then the two states worth interrupting for, a config that failed to parse and setup not finished. */
export function RepoHeader({ repo }: { repo: Repo }) {
  const settings = repoPath(repo.id, "settings");
  return (
    <header className="mb-6" aria-label="Repository">
      <ul className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
        <li className="mr-1 text-sm font-semibold">{repo.full_name}</li>
        {repo.private && (
          <li>
            <Badge variant="outline">
              <Lock aria-hidden />
              Private
            </Badge>
          </li>
        )}
        {!repo.enabled && (
          <li>
            <Status tone="neutral">Disabled</Status>
          </li>
        )}
        <li>
          <Badge variant="outline" className="font-mono">
            <span className="sr-only">Decision backend and model: </span>
            {repo.backend} · {repo.model}
          </Badge>
        </li>
        {!repo.calibrated && (
          <li className="flex items-center gap-1">
            <Badge variant="warning">
              <TriangleAlert aria-hidden />
              Uncalibrated backend
            </Badge>
            <InfoHint label="About the uncalibrated backend">
              This backend does not return calibrated probabilities. Confidence ranks answers; trust measured accuracy, not thresholds alone.
            </InfoHint>
          </li>
        )}
        <li>
          <Badge variant="outline" className="capitalize">
            <span className="sr-only">Your role: </span>
            {repo.role}
          </Badge>
        </li>
        <li>
          <Lanes repo={repo} />
        </li>
      </ul>
      {repo.config_error && (
        <Notice
          tone="destructive"
          className="mt-4"
          title={`Your ${CONFIG_PATH} failed to parse; defaults in use`}
          action={
            <Link href={`${settings}?s=config`} className="inline-flex shrink-0 items-center gap-1 text-sm font-medium text-destructive link-grow">
              Fix in settings <ArrowRight aria-hidden className="size-3.5" />
            </Link>
          }
        >
          <p className="font-mono text-xs break-words">{repo.config_error.replace(/^invalid config: /, "")}</p>
        </Notice>
      )}
      {!repo.enabled && (
        <Notice
          className="mt-4"
          title="Jev is not reading this repository yet"
          action={
            repo.role === "admin" ? (
              <Link href={onboardingHref(repo.id)} className="inline-flex shrink-0 items-center gap-1 text-sm font-medium link-grow">
                Finish setup <ArrowRight aria-hidden className="size-3.5" />
              </Link>
            ) : (
              <span className="text-sm text-muted-foreground">An admin needs to finish setup.</span>
            )
          }
        />
      )}
    </header>
  );
}

export function RepoHeaderSkeleton() {
  return (
    <Busy label="Loading repository" className="mb-6 flex gap-1.5 overflow-hidden">
      {[36, 28, 20, 16, 24, 24, 24, 24].map((w, i) => (
        <Skeleton key={i} className="h-5 shrink-0" style={{ width: `${w * 4}px` }} />
      ))}
    </Busy>
  );
}
