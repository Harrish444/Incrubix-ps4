/*
# Reachline Distribution Ops core schema

1. Purpose
- Creates the persistent single-tenant data model for destination discovery, rules, publishing, certification, imports, renditions, and observability.
2. New tables
- connectors: connector manifests and runtime configuration.
- destinations: catalogue destinations and certification state.
- destination_rules: posting constraints per destination.
- content_items: source content prepared for distribution.
- destination_renditions: destination-specific content versions.
- publishing_jobs: durable publishing and background job state.
- idempotency_records: request fingerprints and replay-safe outcomes.
- certification_runs: certification workflow results.
- certification_evidence: redacted evidence attached to a run.
- catalogue_imports: import summaries.
- catalogue_import_errors: row-level import validation errors.
- activity_logs: structured application activity.
3. Security
- Enables RLS on every table.
- This is a single-tenant workspace without a sign-in screen, so anon and authenticated roles receive explicit CRUD policies.
4. Important notes
- No destructive operations are used.
- Indexes support job polling, catalogue filtering, rules, and audit queries.
*/

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS connectors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text NOT NULL UNIQUE,
  name text NOT NULL,
  version text NOT NULL DEFAULT '1.0.0',
  tier text NOT NULL DEFAULT 'core' CHECK (tier IN ('core','advanced','outstanding')),
  auth text NOT NULL DEFAULT 'none',
  surfaces jsonb NOT NULL DEFAULT '[]'::jsonb,
  capabilities jsonb NOT NULL DEFAULT '[]'::jsonb,
  manifest jsonb NOT NULL DEFAULT '{}'::jsonb,
  enabled boolean NOT NULL DEFAULT true,
  simulated boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS destinations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  url text NOT NULL,
  normalized_url text NOT NULL,
  platform_key text NOT NULL,
  surface text NOT NULL,
  category text NOT NULL DEFAULT 'community',
  audience_tags jsonb NOT NULL DEFAULT '[]'::jsonb,
  language text NOT NULL DEFAULT 'en',
  geo text NOT NULL DEFAULT 'global',
  est_audience integer,
  rules_url text,
  connector_key text NOT NULL REFERENCES connectors(key),
  relevance_score integer CHECK (relevance_score BETWEEN 1 AND 5),
  relevance_reason text,
  level text NOT NULL DEFAULT 'L0' CHECK (level IN ('L0','L1','L2','L3','L4')),
  certification_status text NOT NULL DEFAULT 'uncertified' CHECK (certification_status IN ('uncertified','certified','simulated','demoted')),
  last_certified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(normalized_url, platform_key)
);

CREATE TABLE IF NOT EXISTS destination_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  destination_id uuid NOT NULL UNIQUE REFERENCES destinations(id) ON DELETE CASCADE,
  frequency_cap integer NOT NULL DEFAULT 1 CHECK (frequency_cap > 0),
  frequency_window_hours integer NOT NULL DEFAULT 168 CHECK (frequency_window_hours > 0),
  cooldown_hours integer NOT NULL DEFAULT 0 CHECK (cooldown_hours >= 0),
  self_promo_allowed boolean NOT NULL DEFAULT false,
  link_policy text NOT NULL DEFAULT 'allowed' CHECK (link_policy IN ('allowed','canonical_only','none')),
  disclosure_required boolean NOT NULL DEFAULT false,
  automation_allowed boolean NOT NULL DEFAULT true,
  max_title_chars integer NOT NULL DEFAULT 255,
  max_body_chars integer NOT NULL DEFAULT 32000,
  allowed_media_types jsonb NOT NULL DEFAULT '["text/plain","text/markdown"]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS content_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  body text NOT NULL,
  canonical_url text,
  media jsonb NOT NULL DEFAULT '[]'::jsonb,
  ai_generated boolean NOT NULL DEFAULT false,
  ai_disclosure text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS destination_renditions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  content_item_id uuid NOT NULL REFERENCES content_items(id) ON DELETE CASCADE,
  destination_id uuid NOT NULL REFERENCES destinations(id) ON DELETE CASCADE,
  title text NOT NULL,
  body text NOT NULL,
  changes jsonb NOT NULL DEFAULT '[]'::jsonb,
  validation jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(content_item_id, destination_id)
);

CREATE TABLE IF NOT EXISTS publishing_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  destination_id uuid NOT NULL REFERENCES destinations(id),
  rendition_id uuid REFERENCES destination_renditions(id),
  idempotency_key text NOT NULL,
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','running','succeeded','failed','blocked','cancelled')),
  progress integer NOT NULL DEFAULT 0 CHECK (progress BETWEEN 0 AND 100),
  simulated boolean NOT NULL DEFAULT true,
  platform_post_id text,
  live_url text,
  error_code text,
  error_message text,
  result jsonb NOT NULL DEFAULT '{}'::jsonb,
  queued_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS idempotency_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  idempotency_key text NOT NULL UNIQUE,
  request_fingerprint text NOT NULL,
  job_id uuid REFERENCES publishing_jobs(id),
  outcome jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '24 hours')
);

CREATE TABLE IF NOT EXISTS certification_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  destination_id uuid NOT NULL REFERENCES destinations(id),
  connector_key text NOT NULL REFERENCES connectors(key),
  mode text NOT NULL DEFAULT 'simulation' CHECK (mode IN ('simulation','live')),
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','running','succeeded','failed')),
  outcomes jsonb NOT NULL DEFAULT '[]'::jsonb,
  redacted_response jsonb NOT NULL DEFAULT '{}'::jsonb,
  live_url text,
  cleanup_confirmed boolean NOT NULL DEFAULT false,
  failure_reason text,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS certification_evidence (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  certification_run_id uuid NOT NULL REFERENCES certification_runs(id) ON DELETE CASCADE,
  kind text NOT NULL,
  uri text,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS catalogue_imports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  filename text NOT NULL,
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','running','succeeded','failed')),
  accepted_rows integer NOT NULL DEFAULT 0,
  duplicate_rows integer NOT NULL DEFAULT 0,
  rejected_rows integer NOT NULL DEFAULT 0,
  duration_ms integer,
  output_manifest jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);

CREATE TABLE IF NOT EXISTS catalogue_import_errors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  import_id uuid NOT NULL REFERENCES catalogue_imports(id) ON DELETE CASCADE,
  row_number integer NOT NULL,
  field text,
  code text NOT NULL,
  message text NOT NULL,
  raw_row jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS activity_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  action text NOT NULL,
  entity_type text NOT NULL,
  entity_id uuid,
  level text NOT NULL DEFAULT 'info' CHECK (level IN ('info','success','warning','error')),
  message text NOT NULL,
  correlation_id text,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_destinations_platform ON destinations(platform_key);
CREATE INDEX IF NOT EXISTS idx_destinations_status ON destinations(certification_status);
CREATE INDEX IF NOT EXISTS idx_jobs_status_created ON publishing_jobs(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_jobs_destination ON publishing_jobs(destination_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_idempotency_expires ON idempotency_records(expires_at);
CREATE INDEX IF NOT EXISTS idx_certification_destination ON certification_runs(destination_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_activity_created ON activity_logs(created_at DESC);

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['connectors','destinations','destination_rules','content_items','destination_renditions','publishing_jobs','idempotency_records','certification_runs','certification_evidence','catalogue_imports','catalogue_import_errors','activity_logs'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS "shared_select_%s" ON %I', t, t);
    EXECUTE format('CREATE POLICY "shared_select_%s" ON %I FOR SELECT TO anon, authenticated USING (true)', t, t);
    EXECUTE format('DROP POLICY IF EXISTS "shared_insert_%s" ON %I', t, t);
    EXECUTE format('CREATE POLICY "shared_insert_%s" ON %I FOR INSERT TO anon, authenticated WITH CHECK (true)', t, t);
    EXECUTE format('DROP POLICY IF EXISTS "shared_update_%s" ON %I', t, t);
    EXECUTE format('CREATE POLICY "shared_update_%s" ON %I FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true)', t, t);
    EXECUTE format('DROP POLICY IF EXISTS "shared_delete_%s" ON %I', t, t);
    EXECUTE format('CREATE POLICY "shared_delete_%s" ON %I FOR DELETE TO anon, authenticated USING (true)', t, t);
  END LOOP;
END $$;