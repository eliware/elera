import { expect, jest, test } from '@jest/globals';
import { handleColdRecoveryRoute } from '../../../src/api/routes/cold-recovery.mjs';
const request = (body = {}) => ({ async *[Symbol.asyncIterator]() { yield JSON.stringify(body); } });
const response = () => ({ json: jest.fn() });

test('authorizes read routes and delegates evidence, status, and plan', async () => {
  const protocol = { evidence: jest.fn(async () => 'e'), status: jest.fn(async () => 's'), plan: jest.fn(async () => 'p') };
  for (const [method, path, key] of [['GET', '/api/v1/cluster/cold-recovery/evidence', 'evidence'], ['GET', '/api/v1/cluster/cold-recovery/status', 'status'], ['POST', '/api/v1/cluster/cold-recovery/plan', 'plan']]) {
    const out = response(); await expect(handleColdRecoveryRoute({ method, path, response: out, protocol, auth: { scopes: ['recovery:read'] } })).resolves.toBe(true); expect(protocol[key]).toHaveBeenCalled();
  }
});
test('protects writes and supports internal authorization', async () => {
  const protocol = { retry: jest.fn(async () => 'r'), authorize: jest.fn(async (body) => body), beginBootstrap: jest.fn(async (body) => body), complete: jest.fn(async (body) => body) };
  const denied = response(); await expect(handleColdRecoveryRoute({ method: 'POST', path: '/api/v1/cluster/cold-recovery/retry', response: denied, protocol, auth: {} })).resolves.toBe(false);
  for (const path of ['/api/v1/cluster/cold-recovery/retry', '/api/v1/cluster/cold-recovery/authorize', '/api/v1/cluster/cold-recovery/bootstrap', '/api/v1/cluster/cold-recovery/complete']) { const out = response(); await expect(handleColdRecoveryRoute({ method: 'POST', path, response: out, protocol, internal: true, request: request({ ok: true }) })).resolves.toBe(true); }
  await expect(handleColdRecoveryRoute({ method: 'GET', path: '/other', response: response(), protocol, auth: { root: true } })).resolves.toBe(false);
});
