import { describe, expect, it } from 'vitest';
import { CONNECTORS, verifyHmac } from '../server/connectors/core';

describe('core connector contract', () => {
  it.each(Object.keys(CONNECTORS))('implements the required methods for %s', (key) => {
    const connector = CONNECTORS[key];
    expect(connector.validate).toBeTypeOf('function');
    expect(connector.publish).toBeTypeOf('function');
    expect(connector.get_status).toBeTypeOf('function');
    expect(connector.delete).toBeTypeOf('function');
  });
  it('verifies HMAC signatures without timing shortcuts', () => {
    expect(verifyHmac('reachline', 'a4a447a2c4b3b40e05b9f26a5be0a0e8cde37c3d5c369cfa879d442ce22d1a5a', 'secret')).toBe(false);
    expect(verifyHmac('reachline', 'bad', 'secret')).toBe(false);
  });
  it('rejects oversized content through shared validation', () => {
    const result = CONNECTORS.devto.validate({ title: 'x'.repeat(129), body: 'ok' }, { id: 'd1', name: 'DEV', url: 'https://dev.to', connector_key: 'devto' }, { simulated: true });
    expect(result.valid).toBe(false);
  });
});
