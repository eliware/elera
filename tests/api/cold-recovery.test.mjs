import { expect, jest, test } from '@jest/globals';
import { handleColdRecoveryRoute } from '../../src/api/routes/cold-recovery.mjs';

const response = () => ({ json: jest.fn() });
const request = (body = {}) => ({ async *[Symbol.asyncIterator]() { yield JSON.stringify(body); } });
const protocol = { evidence: jest.fn(async () => ['e']), status: jest.fn(async () => ({ phase: 'evidence' })), plan: jest.fn(async () => ({ eligible: true })), retry: jest.fn(async () => ({ eligible: true })), authorize: jest.fn(async (input) => input), beginBootstrap: jest.fn(async (input) => input), complete: jest.fn(async (input) => input) };
const auth = { root: true, scopes: ['*'] };

test('serves authenticated recovery inspection routes', async () => {
  for (const [method, path, name] of [['GET', '/api/v1/cluster/cold-recovery/evidence', 'evidence'], ['GET', '/api/v1/cluster/cold-recovery/status', 'status'], ['POST', '/api/v1/cluster/cold-recovery/plan', 'plan']]) {
    const out = response();
    await expect(handleColdRecoveryRoute({ method, path, request: request(), response: out, protocol, auth })).resolves.toBe(true);
    expect(protocol[name]).toHaveBeenCalled();
    expect(out.json).toHaveBeenCalledWith(200, expect.objectContaining({ ok: true }));
  }
});

test('requires internal authentication for epoch mutations', async () => {
  const denied = response();
  await expect(handleColdRecoveryRoute({ method: 'POST', path: '/api/v1/cluster/cold-recovery/authorize', request: request({ epoch: 'e' }), response: denied, protocol, auth: { root: false, scopes: [] }, internal: false })).resolves.toBe(false);
  const allowed = response();
  await expect(handleColdRecoveryRoute({ method: 'POST', path: '/api/v1/cluster/cold-recovery/authorize', request: request({ epoch: 'e' }), response: allowed, protocol, auth, internal: true })).resolves.toBe(true);
  expect(protocol.authorize).toHaveBeenCalledWith({ epoch: 'e' });
});

test('supports scoped mutation routes and internal peer access', async () => {
  const scoped = { root: false, scopes: ['recovery:write'] };
  for (const [path, method, name, status] of [
    ['/api/v1/cluster/cold-recovery/retry', 'POST', 'retry', 200],
    ['/api/v1/cluster/cold-recovery/authorize', 'POST', 'authorize', 202],
    ['/api/v1/cluster/cold-recovery/bootstrap', 'POST', 'beginBootstrap', 202],
    ['/api/v1/cluster/cold-recovery/complete', 'POST', 'complete', 202],
  ]) {
    const out = response();
    await expect(handleColdRecoveryRoute({ method, path, request: request({ epoch: 'e' }), response: out, protocol, auth: scoped })).resolves.toBe(true);
    if (name === 'retry') expect(protocol[name]).toHaveBeenCalledWith();
    else expect(protocol[name]).toHaveBeenCalledWith({ epoch: 'e' });
    expect(out.json).toHaveBeenCalledWith(status, expect.objectContaining({ ok: true }));
  }
  const internal = response();
  await expect(handleColdRecoveryRoute({ method: 'POST', path: '/api/v1/cluster/cold-recovery/retry', request: request(), response: internal, protocol, internal: true })).resolves.toBe(true);
});

test('rejects unauthorized and unrelated routes without a protocol', async () => {
  const denied = response();
  await expect(handleColdRecoveryRoute({ method: 'GET', path: '/api/v1/cluster/cold-recovery/evidence', response: denied, protocol, auth: { scopes: ['other'] } })).resolves.toBe(false);
  await expect(handleColdRecoveryRoute({ method: 'POST', path: '/api/v1/cluster/cold-recovery/retry', response: response(), protocol, auth: { scopes: [] } })).resolves.toBe(false);
  await expect(handleColdRecoveryRoute({ method: 'GET', path: '/api/v1/cluster/cold-recovery/status', response: response(), protocol: undefined, auth })).resolves.toBe(false);
  await expect(handleColdRecoveryRoute({ method: 'GET', path: '/api/v1/cluster/cold-recovery/unknown', response: response(), protocol, auth })).resolves.toBe(false);
});
test('checks authorization independently for every recovery endpoint', async () => {
  const readRoutes = [
    ['GET', '/api/v1/cluster/cold-recovery/evidence'],
    ['GET', '/api/v1/cluster/cold-recovery/status'],
    ['POST', '/api/v1/cluster/cold-recovery/plan'],
  ];
  const writeRoutes = [
    '/api/v1/cluster/cold-recovery/retry',
    '/api/v1/cluster/cold-recovery/authorize',
    '/api/v1/cluster/cold-recovery/bootstrap',
    '/api/v1/cluster/cold-recovery/complete',
  ];
  for (const [method, path] of readRoutes) await expect(handleColdRecoveryRoute({ method, path, response: response(), protocol, auth: { root: false, scopes: [] } })).resolves.toBe(false);
  for (const path of writeRoutes) await expect(handleColdRecoveryRoute({ method: 'POST', path, request: request(), response: response(), protocol, auth: { root: false, scopes: [] }, internal: false })).resolves.toBe(false);
  await expect(handleColdRecoveryRoute({ method: 'GET', path: readRoutes[0][1], response: response(), protocol, auth: undefined })).resolves.toBe(false);
});
