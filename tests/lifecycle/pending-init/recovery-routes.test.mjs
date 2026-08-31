import { expect, jest, test } from '@jest/globals';
import { handlePendingRecoveryRoute } from '../../../src/lifecycle/pending-init/recovery-routes.mjs';

const request = (method, url, body = {}) => ({ method, url, headers: {}, async *[Symbol.asyncIterator]() { yield JSON.stringify(body); } });
const response = () => ({ writeHead: jest.fn().mockReturnThis(), end: jest.fn().mockReturnThis(), once: jest.fn() });
const options = (overrides = {}) => ({ request: request('GET', '/other'), response: response(), authorized: () => true, recoveryRequired: true, recoveryReason: 'blocked', recoveryProtocol: { status: async () => ({ phase: 'blocked' }), evidence: async () => [], plan: async () => ({}), retry: async () => ({}), authorize: async (body) => body, beginBootstrap: async (body) => body, complete: async (body) => body }, onRecoveryBootstrap: jest.fn(), onRecoveryComplete: jest.fn(), onRecoveryJoin: async (body) => body, log: { error: jest.fn() }, ...overrides });

test('ignores non-recovery requests and disabled recovery', async () => {
  await expect(handlePendingRecoveryRoute(options())).resolves.toBe(false);
  await expect(handlePendingRecoveryRoute(options({ recoveryRequired: false }))).resolves.toBe(false);
  await expect(handlePendingRecoveryRoute(options({ request: request('POST', '/api/v1/cluster/cold-recovery/unknown') }))).resolves.toBe(false);
  await expect(handlePendingRecoveryRoute(options({ request: request('GET', '/api/v1/cluster/cold-recovery/unknown') }))).resolves.toBe(false);
});
test('serves status, evidence, plan, and retry', async () => {
  for (const [method, url] of [['GET', '/api/v1/cluster/cold-recovery/status'], ['GET', '/api/v1/cluster/cold-recovery/evidence'], ['POST', '/api/v1/cluster/cold-recovery/plan'], ['POST', '/api/v1/cluster/cold-recovery/retry']]) await expect(handlePendingRecoveryRoute(options({ request: request(method, url) }))).resolves.toBe(true);
});
test('handles recovery mutations, joins, and authorization failures', async () => {
  for (const url of ['/authorize', '/bootstrap', '/complete', '/join']) await expect(handlePendingRecoveryRoute(options({ request: request('POST', `/api/v1/cluster/cold-recovery${url}`) }))).resolves.toBe(true);
  await expect(handlePendingRecoveryRoute(options({ request: request('GET', '/api/v1/cluster/cold-recovery/status'), authorized: () => false }))).resolves.toBe(true);
  const malformed = { ...request('POST', '/api/v1/cluster/cold-recovery/join'), async *[Symbol.asyncIterator]() { throw new Error('malformed body'); } };
  await expect(handlePendingRecoveryRoute(options({ request: malformed }))).resolves.toBe(true);
});
