import { expect, test } from '@jest/globals';
import { CLIENT_DRAIN_TIMEOUT_MS, clientDrainTimeout } from '../../src/lifecycle/drain-policy.mjs';

test('uses the default and caps excessive drain timeouts', () => {
  expect(clientDrainTimeout()).toBe(CLIENT_DRAIN_TIMEOUT_MS);
  expect(clientDrainTimeout(CLIENT_DRAIN_TIMEOUT_MS + 1)).toBe(CLIENT_DRAIN_TIMEOUT_MS);
});

test('accepts zero and rejects invalid drain timeouts', () => {
  expect(clientDrainTimeout(0)).toBe(0);
  expect(() => clientDrainTimeout('bad')).toThrow('non-negative');
  expect(() => clientDrainTimeout(-1)).toThrow('non-negative');
});
