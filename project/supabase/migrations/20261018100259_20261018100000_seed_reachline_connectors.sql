/*
# Seed Reachline core connectors

1. Purpose
- Registers the six required Core connector types so destination configuration can reference them safely.
2. Connector records
- discourse, lemmy, devto, ghost, signed_webhook, and assisted.
- Each record identifies its tier, authentication style, supported capabilities, simulation status, and manifest metadata.
3. Security
- Keeps the existing single-tenant anon/authenticated CRUD policies unchanged.
4. Important notes
- All seeded adapters are explicitly marked simulated until a real authorised instance and evidence are configured.
- This migration is idempotent and does not delete or alter user data.
*/

INSERT INTO connectors (key, name, version, tier, auth, surfaces, capabilities, manifest, enabled, simulated)
VALUES
  ('discourse', 'Discourse', '1.0.0', 'core', 'api_key', '["forum"]'::jsonb, '["publish","status","delete","metrics"]'::jsonb, '{"instance_param":"base_url"}'::jsonb, true, true),
  ('lemmy', 'Lemmy', '1.0.0', 'core', 'api_key', '["community"]'::jsonb, '["publish","status","delete"]'::jsonb, '{"instance_param":"base_url"}'::jsonb, true, true),
  ('devto', 'Dev.to', '1.0.0', 'core', 'api_key', '["developer_blog"]'::jsonb, '["publish","status","delete","metrics"]'::jsonb, '{}'::jsonb, true, true),
  ('ghost', 'Ghost', '1.0.0', 'core', 'jwt', '["publication"]'::jsonb, '["publish","status","delete","metrics"]'::jsonb, '{"instance_param":"base_url"}'::jsonb, true, true),
  ('signed_webhook', 'Signed webhook', '1.0.0', 'core', 'hmac_sha256', '["webhook"]'::jsonb, '["publish","status","delete"]'::jsonb, '{"instance_param":"endpoint"}'::jsonb, true, true),
  ('assisted', 'Assisted posting', '1.0.0', 'core', 'none', '["assisted"]'::jsonb, '["publish","status","delete","assist_pack"]'::jsonb, '{}'::jsonb, true, true)
ON CONFLICT (key) DO UPDATE SET
  name = EXCLUDED.name,
  version = EXCLUDED.version,
  tier = EXCLUDED.tier,
  auth = EXCLUDED.auth,
  surfaces = EXCLUDED.surfaces,
  capabilities = EXCLUDED.capabilities,
  manifest = EXCLUDED.manifest,
  enabled = EXCLUDED.enabled,
  simulated = EXCLUDED.simulated,
  updated_at = now();