// v0.2 shapes the settings UI needs on top of src/lib/types.ts (CONTRACT.md "v0.2 additions").
import type { Parsed, Repo, Role } from "./types";

/** GET /api/repos/:id with v0.2's config_error (YAML in the repo failed to parse; defaults in use). */
export type RepoFull = Repo & { config_error: string | null };

/** POST /config/render {yaml}: `yaml` is the text verbatim, `parsed` the normalized config. */
export type ConfigCheck = { yaml: string; parsed: Parsed; edit_url: string; errors: string[] };
/** POST /features: the whole YAML with one mode changed. Committed via GitHub, never written by Jev. */
export type FeatureChange = { yaml: string; edit_url: string };
/** GET /labels/plan: `mapping` values are a label name or {variant: label name}. */
export type LabelPlan = { existing: string[]; missing: string[]; mapping: Record<string, Record<string, string> | string> };
export type NewToken = { id: number; name: string; token: string };

const RANK: Record<Role, number> = { viewer: 0, maintainer: 1, admin: 2 };
export const atLeast = (role: Role, need: Role) => RANK[role] >= RANK[need];
/** Tooltip text for a control the caller's role cannot use. */
export const NEED: Record<"maintainer" | "admin", string> = { maintainer: "Maintainer role needed", admin: "Admin role needed" };

export const CONFIG_PATH = ".github/jev-triage.yml";

const ORDER = ["inbound_gate", "issue_triage", "pr_checks", "routing", "priority", "spam", "ci_gate"];
/** Feature modes in the docs' order (the API returns them in storage order). */
export const featureModes = (r: Pick<RepoFull, "features">) =>
  Object.entries(r.features).sort(([a], [b]) => (ORDER.indexOf(a) + 1 || 99) - (ORDER.indexOf(b) + 1 || 99));
