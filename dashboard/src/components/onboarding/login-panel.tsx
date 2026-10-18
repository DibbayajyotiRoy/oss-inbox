"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { FlaskConical } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Status } from "@/components/ui/status";
import type { SetupStatus } from "@/lib/types";
import { questionLabel } from "@/lib/questions";
import { useApi } from "@/lib/use-api";
import { Brand } from "./flow";

import { GitHubMark, SettleMeter } from "./parts";

const READINGS = [
  { label: questionLabel("issue.type"), valueText: "94% · 212 answers", value: 0.94, threshold: 0.85 },
  { label: questionLabel("priority"), valueText: "88% · 148 answers", value: 0.88, threshold: 0.9 },
  { label: questionLabel("spam"), valueText: "97% · 301 answers", value: 0.97, threshold: 0.95 },
];

/** Sign in. Sends a fresh instance to /welcome; offers sample data when the server runs in demo mode. */
export function LoginPanel() {
  const router = useRouter();
  const status = useApi<SetupStatus>("/api/setup/status");
  const s = status.data;
  const fresh = !!s && !s.app_configured && !s.demo_mode;
  useEffect(() => {
    if (fresh) router.replace("/welcome");
  }, [fresh, router]);

  return (
    <div className="grid min-h-dvh grid-rows-[auto_1fr] bg-background lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] lg:grid-rows-none">
      <div className="flex flex-col px-5 py-6 sm:px-10 lg:min-h-dvh">
        <header>
          <Brand />
        </header>
        <main className="flex flex-1 items-center justify-center py-8 lg:py-12">
          <div className="w-full max-w-sm motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-bottom-1 motion-safe:duration-250">
            <h1 className="text-2xl font-semibold tracking-tight">Triage that earns trust</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              At first it only suggests. It never closes or deletes anything, and it shows how often it is right before it acts by itself.
            </p>

            <div className="mt-8 flex flex-col gap-3">
              {fresh ? (
                <Status tone="progress" className="text-sm">
                  Opening setup
                </Status>
              ) : !s && !status.error ? (
                <Skeleton className="h-10 w-full" />
              ) : s?.demo_mode ? (
                <>
                  <Button asChild size="lg">
                    <a href="/api/auth/login">
                      <FlaskConical />
                      Try with sample data
                    </a>
                  </Button>
                  <p className="text-[13px] text-muted-foreground">Demo instance. Nothing is written to GitHub.</p>
                  <Button asChild variant="link" size="sm" className="h-8 self-start">
                    <Link href="/welcome">Set up your own instance</Link>
                  </Button>
                </>
              ) : (
                <>
                  <Button asChild size="lg">
                    <a href="/api/auth/login">
                      <GitHubMark className="size-4" />
                      Continue with GitHub
                    </a>
                  </Button>
                  <p className="text-[13px] text-muted-foreground">Access follows your GitHub permissions on each repository.</p>
                  {status.error ? (
                    <Status tone="warning" className="mt-1">
                      Can&apos;t reach the server
                    </Status>
                  ) : null}
                </>
              )}
            </div>
          </div>
        </main>
      </div>

      <aside aria-label="Example results" className="flex flex-col justify-center border-t bg-muted/20 lg:border-t-0 lg:border-l">
        <div className="mx-auto w-full max-w-md px-5 py-10 sm:px-10 lg:py-16">
          <p className="text-[13px] text-muted-foreground">Example results</p>
          <div className="mt-6 flex flex-col gap-7">
            {READINGS.map((r, i) => (
              <SettleMeter key={r.label} i={i + 2} {...r} />
            ))}
          </div>
          <p className="mt-8 text-sm text-muted-foreground">
            Every answer shows how sure Jev is, how sure it must be, and how many answers that rests on. Yours come from your own repository history.
          </p>
        </div>
      </aside>
    </div>
  );
}
