// Shapes from CONTRACT.md "v0.2 additions". Dates are ISO-8601 UTC strings.
import type { Parsed, Rendered, Repo } from "./types";

export type SetupStatus = {
  app_configured: boolean;
  app_slug: string | null;
  install_url: string | null;
  setup_url: string | null; // "/api/setup" while the app is not configured
  decision_backend: "jev" | "anthropic";
  decision_key_present: boolean;
  calibrated: boolean;
  model: string;
  public_url: string;
  dashboard_url: string;
  demo_mode: boolean;
  installations: number;
};

export type OnboardingStep = {
  id: "enabled" | "labels" | "config" | "backfill" | "first_event" | "mode";
  title: string;
  done: boolean;
  optional: boolean;
  detail: string | null;
};
export type Onboarding = { complete: boolean; steps: OnboardingStep[] };

export type LabelPlan = { existing: string[]; missing: string[]; mapping: Record<string, Record<string, string> | string> };

export type Backfill = {
  status: "idle" | "queued" | "running" | "done" | "error";
  processed: number;
  total: number | null;
  with_truth: number;
  errors: number;
  error: string | null;
  started_at: string | null;
  finished_at: string | null;
};

/** GET /api/repos/:id also returns config_error (the YAML in the repo failed to parse; defaults in use). */
export type RepoDetail = Repo & { config_error?: string | null };
export type RenderedConfig = Rendered & { parsed: Parsed };
