// Shapes from CONTRACT.md "HTTP API". Dates are ISO-8601 UTC strings.
export type Role = "admin" | "maintainer" | "viewer";
export type Mode = "off" | "shadow" | "auto";
export type Page<T> = { items: T[]; next_cursor: string | null };

export type Me = { login: string; avatar_url: string; orgs: { id: number; login: string; avatar_url: string }[] };

export type RepoCard = {
  id: number; full_name: string; private: boolean; enabled: boolean; role: Role;
  items_30d: number; acted_share: number | null; queued_open: number; held_open: number;
  accuracy: number | null; override_rate: number | null;
  trend: { date: string; acted: number; queued: number; shadow: number }[];
};
export type Overview = { org: { id: number; login: string }; repos: RepoCard[] };

export type QuestionInfo = {
  id: string; feature: string; type: "choice" | "score" | "noul";
  threshold: number; default_threshold: number; n: number; accuracy: number | null; measured: boolean;
};
export type Repo = {
  id: number; full_name: string; private: boolean; enabled: boolean; role: Role; default_branch: string;
  backend: string; model: string; calibrated: boolean; features: Record<string, Mode>;
  backfill_status: string | null; config_source: "repo" | "org" | "default"; questions: QuestionInfo[];
};

export type ItemSummary = {
  id: number; kind: "issue" | "pr" | "ci_report" | "report"; number: number | null; title: string;
  html_url: string | null; author: string | null; created_at: string;
};
export type Suggestion = {
  decision_id: number; question_id: string; answer: string; confidence: number; threshold: number;
  options: string[]; probabilities: Record<string, number>;
};
export type QueueEntry = {
  id: number; item: ItemSummary; feature: string; reason: string; bucket: "review" | "held";
  created_at: string; age_hours: number; suggestions: Suggestion[];
};

export type Decision = {
  id: number; question_id: string; answer: string; confidence: number; threshold: number;
  outcome: string; probabilities: Record<string, number>;
};
export type Run = {
  id: number; trigger: string; model_version: string; backend: string; calibrated: boolean;
  latency_ms: number; tokens_in: number; cost_usd: number; created_at: string; error: string | null;
  state_text: string | null; decisions: Decision[];
};
export type ItemDetail = {
  item: ItemSummary & { body: string | null; repo_id: number; state: string };
  runs: Run[];
  actions: { id: number; kind: string; github_ref: string | null; dry_run: boolean; created_at: string }[];
  overrides: { id: number; decision_id: number; user: string; new_answer: string; created_at: string }[];
};

export type Preview = { question_id: string; threshold: number; points: { confidence: number; correct: boolean | null }[] };
export type Calibration = {
  question_id: string; n: number; ece: number | null;
  bins: { lo: number; hi: number; n: number; mean_confidence: number; accuracy: number }[];
};
export type EvalQuestion = {
  id: string; n: number; accuracy: number | null; ece: number | null; recommended_threshold: number | null;
  confusion: { labels: string[]; matrix: number[][] } | null; // matrix[truth][predicted]
  worst_misses: { item_id: number; number: number | null; title: string; answer: string; truth: string; confidence: number; html_url: string | null }[];
};
export type Evaluation = { backfill_status: string | null; upper_bound_note: string; questions: EvalQuestion[] };

export type CiOutcome = "filed" | "merged" | "flaky" | "infra" | "queued" | "rate_limited" | "held";
export type CiReport = {
  id: number; created_at: string; title: string; source: string; outcome: CiOutcome;
  issue_number: number | null; merged_into: number | null; run_url: string | null;
  candidates: { item_id: number; number: number | null; title: string; retrieval_score: number; same_as_probability: number | null }[];
};
export type FlakyTest = { test_id: string; occurrences: number; first_seen: string; last_seen: string; last_run_url: string | null };

export type Parsed = Record<string, unknown> & { thresholds?: Record<string, number> };
export type ConfigDoc = { yaml: string; source: string; parsed: Parsed; edit_url: string; labels: string[] };
export type Rendered = { yaml: string; edit_url: string; errors: string[] };
export type CiToken = { id: number; name: string; created_by: string; created_at: string; revoked_at: string | null };
export type AuditRow = { id: number; actor: string; action: string; target: string | null; details: unknown; created_at: string };
