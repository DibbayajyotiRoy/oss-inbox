-- Applied idempotently on startup (app.db.init_schema). Additive changes only.

CREATE TABLE IF NOT EXISTS orgs (
  id bigserial PRIMARY KEY,
  github_installation_id bigint UNIQUE NOT NULL,
  login text NOT NULL,
  avatar_url text,
  settings jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS repos (
  id bigserial PRIMARY KEY,
  org_id bigint NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  github_repo_id bigint UNIQUE NOT NULL,
  full_name text NOT NULL,
  description text NOT NULL DEFAULT '',
  default_branch text NOT NULL DEFAULT 'main',
  private boolean NOT NULL DEFAULT false,
  enabled boolean NOT NULL DEFAULT false,
  private_ack_by text,                       -- admin who acknowledged sending private content to the backend
  config jsonb,                              -- parsed RepoConfig cache; source of truth is the YAML file
  config_source text NOT NULL DEFAULT 'default' CHECK (config_source IN ('repo','org','default')),
  config_sha text,
  rules_text text,
  rules_sha text,
  backfill_status text,                      -- null|queued|running|done|error:<msg>
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sessions (
  id text PRIMARY KEY,
  github_user_id bigint NOT NULL,
  login text NOT NULL,
  avatar_url text NOT NULL DEFAULT '',
  token text NOT NULL,                       -- user-to-server token (for /user/installations)
  expires_at timestamptz NOT NULL
);

CREATE TABLE IF NOT EXISTS items (
  id bigserial PRIMARY KEY,
  repo_id bigint NOT NULL REFERENCES repos(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('issue','pr','ci_report','report')),
  github_number integer,
  title text NOT NULL DEFAULT '',
  body text NOT NULL DEFAULT '',
  author text,
  author_association text,
  html_url text,
  state text NOT NULL DEFAULT 'open',
  source text NOT NULL CHECK (source IN ('webhook','backfill','ci_agent','external')),
  extra jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  search tsvector GENERATED ALWAYS AS (to_tsvector('english', coalesce(title,'') || ' ' || coalesce(body,''))) STORED
);
CREATE UNIQUE INDEX IF NOT EXISTS items_repo_number ON items (repo_id, kind, github_number) WHERE github_number IS NOT NULL;
CREATE INDEX IF NOT EXISTS items_search ON items USING gin (search);
CREATE INDEX IF NOT EXISTS items_repo_created ON items (repo_id, created_at DESC);

CREATE TABLE IF NOT EXISTS decision_runs (
  id bigserial PRIMARY KEY,
  item_id bigint NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  trigger text NOT NULL,
  backend text NOT NULL,
  model_version text NOT NULL DEFAULT '',
  calibrated boolean NOT NULL DEFAULT true,
  state_hash text NOT NULL,
  state_text text,                           -- purged after retention_days
  latency_ms integer NOT NULL DEFAULT 0,
  tokens_in integer NOT NULL DEFAULT 0,
  cost_usd numeric(12,8) NOT NULL DEFAULT 0,
  error text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS runs_item ON decision_runs (item_id, created_at DESC);

CREATE TABLE IF NOT EXISTS decisions (
  id bigserial PRIMARY KEY,
  run_id bigint NOT NULL REFERENCES decision_runs(id) ON DELETE CASCADE,
  item_id bigint NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  repo_id bigint NOT NULL REFERENCES repos(id) ON DELETE CASCADE,
  question_id text NOT NULL,                 -- may carry #suffix for per-candidate questions
  base_question text NOT NULL,
  answer text NOT NULL,
  probabilities jsonb NOT NULL,
  confidence real NOT NULL,
  threshold_at_time real NOT NULL,
  outcome text NOT NULL DEFAULT 'pending' CHECK (outcome IN ('pending','acted','queued','shadow','skipped')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS decisions_repo_q ON decisions (repo_id, base_question, created_at DESC);
CREATE INDEX IF NOT EXISTS decisions_item ON decisions (item_id);

CREATE TABLE IF NOT EXISTS actions (
  id bigserial PRIMARY KEY,
  item_id bigint REFERENCES items(id) ON DELETE CASCADE,
  repo_id bigint NOT NULL REFERENCES repos(id) ON DELETE CASCADE,
  decision_id bigint REFERENCES decisions(id) ON DELETE SET NULL,
  kind text NOT NULL,                        -- label|unlabel|comment|assign|file_issue|check_run
  github_ref text,
  payload jsonb NOT NULL DEFAULT '{}',       -- includes dry_run flag
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS actions_item ON actions (item_id);

CREATE TABLE IF NOT EXISTS comment_state (
  item_id bigint NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  key text NOT NULL,
  github_comment_id bigint,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (item_id, key)
);

CREATE TABLE IF NOT EXISTS queue_items (
  id bigserial PRIMARY KEY,
  item_id bigint NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  repo_id bigint NOT NULL REFERENCES repos(id) ON DELETE CASCADE,
  feature text NOT NULL,
  reason text NOT NULL,
  bucket text NOT NULL DEFAULT 'review' CHECK (bucket IN ('review','held')),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','accepted','dismissed','released')),
  resolved_by text,
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS queue_open_unique ON queue_items (item_id, bucket) WHERE status = 'open';
CREATE INDEX IF NOT EXISTS queue_repo_open ON queue_items (repo_id, bucket, created_at) WHERE status = 'open';

CREATE TABLE IF NOT EXISTS overrides (
  id bigserial PRIMARY KEY,
  decision_id bigint NOT NULL REFERENCES decisions(id) ON DELETE CASCADE,
  github_user_id bigint,
  user_login text NOT NULL,
  new_answer text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ground_truth (
  item_id bigint NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  question_id text NOT NULL,                 -- base question id (full id for per-candidate)
  answer text NOT NULL,
  source text NOT NULL CHECK (source IN ('backfill','override')),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (item_id, question_id)
);

CREATE TABLE IF NOT EXISTS ci_tokens (
  id bigserial PRIMARY KEY,
  repo_id bigint NOT NULL REFERENCES repos(id) ON DELETE CASCADE,
  name text NOT NULL,
  token_hash text UNIQUE NOT NULL,           -- sha256 hex; plaintext shown once
  created_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz
);

CREATE TABLE IF NOT EXISTS ci_reports (
  id bigserial PRIMARY KEY,
  repo_id bigint NOT NULL REFERENCES repos(id) ON DELETE CASCADE,
  item_id bigint REFERENCES items(id) ON DELETE SET NULL,
  source text NOT NULL DEFAULT 'ci' CHECK (source IN ('ci','external')),
  payload jsonb NOT NULL,
  outcome text NOT NULL DEFAULT 'pending',
  filed_issue_number integer,
  merged_into_number integer,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ci_reports_repo ON ci_reports (repo_id, created_at DESC);

CREATE TABLE IF NOT EXISTS ci_candidates (
  report_id bigint NOT NULL REFERENCES ci_reports(id) ON DELETE CASCADE,
  candidate_item_id bigint NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  retrieval_score real NOT NULL,
  same_as_probability real,
  PRIMARY KEY (report_id, candidate_item_id)
);

CREATE TABLE IF NOT EXISTS flaky_tests (
  repo_id bigint NOT NULL REFERENCES repos(id) ON DELETE CASCADE,
  test_id text NOT NULL,
  occurrences integer NOT NULL DEFAULT 0,
  first_seen timestamptz NOT NULL DEFAULT now(),
  last_seen timestamptz NOT NULL DEFAULT now(),
  last_run_url text,
  PRIMARY KEY (repo_id, test_id)
);

CREATE TABLE IF NOT EXISTS webhook_deliveries (
  delivery_id text PRIMARY KEY,
  event text NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS audit_log (
  id bigserial PRIMARY KEY,
  org_id bigint REFERENCES orgs(id) ON DELETE CASCADE,
  repo_id bigint REFERENCES repos(id) ON DELETE CASCADE,
  actor text NOT NULL,
  action text NOT NULL,
  target text NOT NULL DEFAULT '',
  details jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS audit_repo ON audit_log (repo_id, created_at DESC);

-- v0.2 (additive)
ALTER TABLE repos ADD COLUMN IF NOT EXISTS backfill_progress jsonb;  -- {processed,total,with_truth,errors,started_at,finished_at}
ALTER TABLE repos ADD COLUMN IF NOT EXISTS config_error text;        -- parse error of the repo's YAML while defaults are in use
