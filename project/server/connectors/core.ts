import crypto from 'node:crypto';

export const SHARED_ERRORS = {
  DEST_SPEC_VIOLATION: { retryable: false },
  DEST_RULE_FREQUENCY_CAP: { retryable: true },
  CONNECTION_AUTH_EXPIRED: { retryable: true },
  PLATFORM_RATE_LIMIT: { retryable: true },
  PLATFORM_QUOTA_EXHAUSTED: { retryable: true },
  PLATFORM_CONTENT_REJECTED: { retryable: false },
  PLATFORM_UNAVAILABLE: { retryable: true },
  CONNECTOR_DISABLED: { retryable: false },
} as const;

export type Rendition = { title: string; body: string; canonical_url?: string; media?: Array<{ type: string; url?: string }> };
export type Destination = { id: string; name: string; url: string; connector_key: string };
export type Connection = { simulated?: boolean; secret?: string; endpoint?: string };
export type PublishResult = { platform_post_id: string; live_url?: string; status: 'published' | 'queued' | 'assisted'; simulated: boolean };

export interface Connector {
  readonly key: string;
  validate(rendition: Rendition, destination: Destination, connection: Connection): { valid: boolean; violations?: string[] };
  publish(rendition: Rendition, destination: Destination, connection: Connection, idempotencyKey: string): Promise<PublishResult>;
  get_status(platformPostId: string, connection: Connection): Promise<{ status: string; platform_post_id: string; simulated: boolean }>;
  delete(platformPostId: string, connection: Connection): Promise<{ deleted: boolean; simulated: boolean }>;
  fetch_metrics?(platformPostId: string, connection: Connection, since?: string): Promise<Record<string, number>>;
  build_assist_pack?(rendition: Rendition, destination: Destination): Record<string, unknown>;
}

function validateText(rendition: Rendition, titleMax: number, bodyMax: number, destination: Destination) {
  const violations: string[] = [];
  if (!rendition.title.trim() || rendition.title.length > titleMax) violations.push(`title must be 1-${titleMax} characters`);
  if (!rendition.body.trim() || rendition.body.length > bodyMax) violations.push(`body must be 1-${bodyMax} characters`);
  if (!destination.url) violations.push('destination URL is required');
  return violations;
}

export class MockConnector implements Connector {
  constructor(public readonly key: string, private readonly limits: { title: number; body: number }, private readonly assisted = false) {}
  validate(rendition: Rendition, destination: Destination) {
    const violations = validateText(rendition, this.limits.title, this.limits.body, destination);
    return { valid: violations.length === 0, ...(violations.length ? { violations } : {}) };
  }
  async publish(rendition: Rendition, destination: Destination, connection: Connection, idempotencyKey: string): Promise<PublishResult> {
    const validation = this.validate(rendition, destination);
    if (!validation.valid) throw Object.assign(new Error(validation.violations?.join('; ')), { code: 'DEST_SPEC_VIOLATION' });
    const digest = crypto.createHash('sha256').update(`${this.key}:${destination.id}:${idempotencyKey}`).digest('hex').slice(0, 16);
    return { platform_post_id: `sim_${this.key}_${digest}`, live_url: `${destination.url.replace(/\/$/, '')}/simulated/${digest}`, status: this.assisted ? 'assisted' : 'published', simulated: true };
  }
  async get_status(platformPostId: string) { return { status: 'published', platform_post_id: platformPostId, simulated: true }; }
  async delete() { return { deleted: true, simulated: true }; }
  async fetch_metrics() { return { views: 0, likes: 0, comments: 0, shares: 0 }; }
  build_assist_pack(rendition: Rendition, destination: Destination) { return { destination: destination.name, title: rendition.title, body: rendition.body, checklist: ['Confirm community rules', 'Paste prepared rendition', 'Record live URL'] }; }
}

export const CONNECTORS: Record<string, Connector> = {
  discourse: new MockConnector('discourse', { title: 255, body: 32000 }),
  lemmy: new MockConnector('lemmy', { title: 200, body: 20000 }),
  devto: new MockConnector('devto', { title: 128, body: 100000 }),
  ghost: new MockConnector('ghost', { title: 255, body: 100000 }),
  signed_webhook: new MockConnector('signed_webhook', { title: 255, body: 32000 }),
  assisted: new MockConnector('assisted', { title: 255, body: 32000 }, true),
};

export function verifyHmac(payload: string, signature: string, secret: string) {
  const expected = crypto.createHmac('sha256', secret).update(payload).digest('hex');
  const expectedBuffer = Buffer.from(expected, 'utf8');
  const receivedBuffer = Buffer.from(signature, 'utf8');
  return expectedBuffer.length === receivedBuffer.length && crypto.timingSafeEqual(expectedBuffer, receivedBuffer);
}
