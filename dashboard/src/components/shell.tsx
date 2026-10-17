"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createContext, useContext, type ReactNode } from "react";
import { api } from "@/lib/api";
import type { Me } from "@/lib/types";
import { useApi } from "@/lib/use-api";
import { Load } from "./ui";

const MeCtx = createContext<Me | null>(null);
export function useMe() {
  const me = useContext(MeCtx);
  if (!me) throw new Error("useMe outside Shell");
  return me;
}

export function Shell({ children }: { children: ReactNode }) {
  const me = useApi<Me>("/api/me");
  const router = useRouter();
  return (
    <>
      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-2">
          <Link href="/" className="font-semibold text-fg no-underline">Jev Triage</Link>
          {me.data && me.data.orgs.length > 1 && (
            <select name="org" aria-label="Organization" className="input" defaultValue="" onChange={(e) => e.target.value && router.push(`/orgs/${e.target.value}`)}>
              <option value="">Switch org…</option>
              {me.data.orgs.map((o) => <option key={o.id} value={o.id}>{o.login}</option>)}
            </select>
          )}
          <span className="flex-1" />
          {me.data && (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={me.data.avatar_url} alt="" width={24} height={24} className="rounded-full" />
              <span className="max-sm:sr-only">{me.data.login}</span>
              <button
                className="btn"
                onClick={async () => {
                  await api("/api/auth/logout", { method: "POST" }).catch(() => {});
                  router.replace("/login");
                }}
              >
                Sign out
              </button>
            </>
          )}
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-4">
        <Load res={me}>{(m) => <MeCtx value={m}>{children}</MeCtx>}</Load>
      </main>
    </>
  );
}
