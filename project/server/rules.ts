import type { QueryRunner } from './db.js';
import type { Destination, Rendition } from './connectors/core.js';

type RuleRow = {
  frequency_cap: number;
  frequency_window_hours: number;
  cooldown_hours: number;
  self_promo_allowed: boolean;
  link_policy: 'allowed' | 'canonical_only' | 'none';
  disclosure_required: boolean;
  automation_allowed: boolean;
  max_title_chars: number;
  max_body_chars: number;
  allowed_media_types: string[];
};

export type RuleViolation = { code: string; message: string; retryable: boolean; details?: Record<string, unknown> };

const promotionalPattern = /\b(buy|sign\s*up|try our|our product|limited offer|discount|pricing|book a demo)\b/i;
const linkPattern = /https?:\/\/[^\s)]+/gi;

export async function validatePostingRules(runner: QueryRunner, destination: Destination, rendition: Rendition, content: { ai_generated?: boolean; ai_disclosure?: string; media?: Array<{ type: string }> }, now = new Date()): Promise<RuleViolation[]> {
  const rows = (await runner.query<RuleRow>(`select frequency_cap, frequency_window_hours, cooldown_hours, self_promo_allowed, link_policy, disclosure_required, automation_allowed, max_title_chars, max_body_chars, allowed_media_types from destination_rules where destination_id = $1`, [destination.id])).rows;
  if (!rows[0]) return [{ code: 'DEST_RULE_MISSING', message: 'Destination posting rules are not configured', retryable: false }];
  const rule = rows[0];
  const violations: RuleViolation[] = [];
  if (!rule.automation_allowed) violations.push({ code: 'CONNECTOR_DISABLED', message: 'Automation is disabled for this destination', retryable: false });
  if (rendition.title.length > rule.max_title_chars) violations.push({ code: 'DEST_SPEC_VIOLATION', message: `Title exceeds the ${rule.max_title_chars}-character destination limit`, retryable: false, details: { max: rule.max_title_chars } });
  if (rendition.body.length > rule.max_body_chars) violations.push({ code: 'DEST_SPEC_VIOLATION', message: `Body exceeds the ${rule.max_body_chars}-character destination limit`, retryable: false, details: { max: rule.max_body_chars } });
  if (!rule.self_promo_allowed && promotionalPattern.test(`${rendition.title}\n${rendition.body}`)) violations.push({ code: 'DEST_SPEC_VIOLATION', message: 'Self-promotional language is not allowed at this destination', retryable: false });
  const links = `${rendition.title}\n${rendition.body}`.match(linkPattern) ?? [];
  if (rule.link_policy === 'none' && links.length) violations.push({ code: 'DEST_SPEC_VIOLATION', message: 'Links are not allowed at this destination', retryable: false });
  if (rule.link_policy === 'canonical_only' && links.some((link) => link !== contentCanonical(rendition))) violations.push({ code: 'DEST_SPEC_VIOLATION', message: 'Only the canonical URL may be included', retryable: false });
  if (rule.disclosure_required && content.ai_generated && !content.ai_disclosure?.trim()) violations.push({ code: 'DEST_SPEC_VIOLATION', message: 'AI-generated content disclosure is required', retryable: false });
  for (const media of content.media ?? []) if (!rule.allowed_media_types.includes(media.type)) violations.push({ code: 'DEST_SPEC_VIOLATION', message: `Media type ${media.type} is not supported`, retryable: false, details: { allowed: rule.allowed_media_types } });
  const windowStart = new Date(now.getTime() - rule.frequency_window_hours * 60 * 60 * 1000);
  const recent = (await runner.query<{ count: string }>(`select count(*) from publishing_jobs where destination_id = $1 and status = 'succeeded' and created_at >= $2`, [destination.id, windowStart])).rows[0];
  if (Number(recent?.count ?? 0) >= rule.frequency_cap) violations.push({ code: 'DEST_RULE_FREQUENCY_CAP', message: `Frequency cap reached (${rule.frequency_cap} post(s) per ${rule.frequency_window_hours} hours)`, retryable: true, details: { reset_at: new Date(windowStart.getTime() + rule.frequency_window_hours * 60 * 60 * 1000).toISOString() } });
  if (rule.cooldown_hours > 0) {
    const cooldown = (await runner.query<{ created_at: string }>(`select created_at from publishing_jobs where destination_id = $1 and status = 'succeeded' order by created_at desc limit 1`, [destination.id])).rows[0];
    if (cooldown && new Date(cooldown.created_at).getTime() + rule.cooldown_hours * 60 * 60 * 1000 > now.getTime()) violations.push({ code: 'DEST_RULE_FREQUENCY_CAP', message: `Cooldown is active for ${rule.cooldown_hours} hours`, retryable: true, details: { retry_after: new Date(new Date(cooldown.created_at).getTime() + rule.cooldown_hours * 60 * 60 * 1000).toISOString() } });
  }
  return violations;
}

function contentCanonical(rendition: Rendition) { return rendition.canonical_url ?? ''; }
