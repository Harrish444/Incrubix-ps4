import { describe, expect, it } from 'vitest';
import { CONNECTORS } from '../server/connectors/core';

describe('posting rule boundaries', () => {
  it('uses platform-specific title limits before publishing', () => {
    const result = CONNECTORS.devto.validate({ title: 'a'.repeat(129), body: 'valid' }, { id: 'd', name: 'DEV', url: 'https://dev.to', connector_key: 'devto' }, { simulated: true });
    expect(result.valid).toBe(false);
    expect(result.violations?.[0]).toContain('128');
  });
  it('keeps assisted posting inside the shared connector contract', async () => {
    const result = await CONNECTORS.assisted.publish({ title: 'Discussion', body: 'A useful post' }, { id: 'd', name: 'Partner', url: 'https://example.test', connector_key: 'assisted' }, { simulated: true }, 'key-1');
    expect(result.status).toBe('assisted');
    expect(result.simulated).toBe(true);
  });
});
