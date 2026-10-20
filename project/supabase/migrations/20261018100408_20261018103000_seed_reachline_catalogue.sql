/*
# Seed Reachline catalogue examples

1. Purpose
- Adds five clearly labelled sample destinations and their posting rules so a fresh workspace has meaningful stored data for the dashboard and simulation workflow.
2. Data
- Discourse, Lemmy, Dev.to, Ghost, and Assisted destinations.
- Frequency, self-promotion, link, disclosure, automation, length, and media rules for each destination.
3. Security
- Uses the existing single-tenant RLS policies; no new permissions are introduced.
4. Important notes
- These are operator-owned simulation examples, not claims of live certification.
- The migration is idempotent through the destination URL/platform unique key and does not delete data.
*/

INSERT INTO destinations (name, url, normalized_url, platform_key, surface, category, audience_tags, language, geo, est_audience, connector_key, relevance_score, relevance_reason, level, certification_status)
VALUES
  ('Indie Hackers', 'https://www.indiehackers.com', 'https://www.indiehackers.com', 'discourse', 'forum', 'founders', '["founders","saas"]'::jsonb, 'en', 'global', 250000, 'discourse', 5, 'Strong founder and SaaS audience fit.', 'L3', 'uncertified'),
  ('Lemmy.World', 'https://lemmy.world', 'https://lemmy.world', 'lemmy', 'community', 'open-web', '["open web","technology"]'::jsonb, 'en', 'global', 180000, 'lemmy', 4, 'Relevant technical communities with federated reach.', 'L3', 'simulated'),
  ('DEV Community', 'https://dev.to', 'https://dev.to', 'devto', 'developer_blog', 'developer', '["developers","ai","software"]'::jsonb, 'en', 'global', 1000000, 'devto', 5, 'High-fit developer publishing surface.', 'L4', 'uncertified'),
  ('The Growth Journal', 'https://growth.example.test', 'https://growth.example.test', 'ghost', 'publication', 'marketing', '["marketing","growth","saas"]'::jsonb, 'en', 'global', 45000, 'ghost', 4, 'Marketing and SaaS readership; requires review.', 'L3', 'uncertified'),
  ('Founders Circle', 'https://partners.example.test/founders', 'https://partners.example.test/founders', 'assisted', 'assisted', 'founders', '["founders","creators"]'::jsonb, 'en', 'global', 12000, 'assisted', 3, 'Human-assisted partner workflow.', 'L1', 'simulated')
ON CONFLICT (normalized_url, platform_key) DO NOTHING;

INSERT INTO destination_rules (destination_id, frequency_cap, frequency_window_hours, cooldown_hours, self_promo_allowed, link_policy, disclosure_required, automation_allowed, max_title_chars, max_body_chars, allowed_media_types)
SELECT id, 1, 168, 24, false, 'allowed', false, true, 255, 32000, '["text/plain","text/markdown","image/png"]'::jsonb FROM destinations WHERE connector_key = 'discourse'
ON CONFLICT (destination_id) DO NOTHING;
INSERT INTO destination_rules (destination_id, frequency_cap, frequency_window_hours, cooldown_hours, self_promo_allowed, link_policy, disclosure_required, automation_allowed, max_title_chars, max_body_chars, allowed_media_types)
SELECT id, 1, 168, 24, false, 'allowed', true, true, 200, 20000, '["text/plain","text/markdown","image/png"]'::jsonb FROM destinations WHERE connector_key = 'lemmy'
ON CONFLICT (destination_id) DO NOTHING;
INSERT INTO destination_rules (destination_id, frequency_cap, frequency_window_hours, cooldown_hours, self_promo_allowed, link_policy, disclosure_required, automation_allowed, max_title_chars, max_body_chars, allowed_media_types)
SELECT id, 3, 168, 8, true, 'canonical_only', true, true, 128, 100000, '["text/plain","text/markdown","image/png","image/jpeg"]'::jsonb FROM destinations WHERE connector_key = 'devto'
ON CONFLICT (destination_id) DO NOTHING;
INSERT INTO destination_rules (destination_id, frequency_cap, frequency_window_hours, cooldown_hours, self_promo_allowed, link_policy, disclosure_required, automation_allowed, max_title_chars, max_body_chars, allowed_media_types)
SELECT id, 2, 720, 48, true, 'allowed', false, true, 255, 100000, '["text/plain","text/markdown","image/png","image/jpeg"]'::jsonb FROM destinations WHERE connector_key = 'ghost'
ON CONFLICT (destination_id) DO NOTHING;
INSERT INTO destination_rules (destination_id, frequency_cap, frequency_window_hours, cooldown_hours, self_promo_allowed, link_policy, disclosure_required, automation_allowed, max_title_chars, max_body_chars, allowed_media_types)
SELECT id, 1, 168, 24, true, 'allowed', false, true, 255, 32000, '["text/plain","text/markdown","image/png","image/jpeg","video/mp4"]'::jsonb FROM destinations WHERE connector_key = 'assisted'
ON CONFLICT (destination_id) DO NOTHING;