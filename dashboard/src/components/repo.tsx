"use client";
import { createContext, useContext } from "react";
import type { Repo } from "@/lib/types";

const Ctx = createContext<{ repo: Repo; reload: () => void } | null>(null);
export const RepoProvider = Ctx.Provider;
export function useRepo() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useRepo outside repo layout");
  return { ...c, canAct: c.repo.role !== "viewer", isAdmin: c.repo.role === "admin" };
}
