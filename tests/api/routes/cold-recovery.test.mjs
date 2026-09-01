import { expect, jest, test } from '@jest/globals';
import { handleColdRecoveryRoute } from '../../../src/api/routes/cold-recovery.mjs';
const request = (body = {}) => ({ async *[Symbol.asyncIterator]() { yield JSON.stringify(body); } });
const response = () => ({ json: jest.fn() });

test('rejects unauthorized recovery routes', async () => {
  const protocol = { evidence: jest.fn(), status: jest.fn(), plan: jest.fn(), retry: jest.fn(), authorize: jest.fn(), beginBootstrap: jest.fn(), complete: jest.fn() };
  await expect(handleColdRecoveryRoute({ method: 'GET', path: '/api/v1/cluster/cold-recovery/evidence', response: response(), protocol, auth: {} })).resolves.toBe(false);
  await expect(handleColdRecoveryRoute({ method: 'GET', path: '/api/v1/cluster/cold-recovery/status', response: response(), protocol, auth: {} })).resolves.toBe(false);
  await expect(handleColdRecoveryRoute({ method: 'POST', path: '/api/v1/cluster/cold-recovery/plan', response: response(), protocol, auth: {} })).resolves.toBe(false);
  await expect(handleColdRecoveryRoute({ method: 'POST', path: '/api/v1/cluster/cold-recovery/retry', response: response(), protocol, auth: {} })).resolves.toBe(false);
  await expect(handleColdRecoveryRoute({ method: 'POST', path: '/api/v1/cluster/cold-recovery/authorize', response: response(), protocol, auth: {} })).resolves.toBe(false);
  await expect(handleColdRecoveryRoute({ method: 'POST', path: '/api/v1/cluster/cold-recovery/bootstrap', response: response(), protocol, auth: {} })).resolves.toBe(false);
  await expect(handleColdRecoveryRoute({ method: 'POST', path: '/api/v1/cluster/cold-recovery/complete', response: response(), protocol, auth: {} })).resolves.toBe(false);
});

test('authorizes evidence route', async () => {
  const responseValue = response();
  const protocol = { evidence: jest.fn(async () => 'e') };
  await expect(handleColdRecoveryRoute({ method: 'GET', path: '/api/v1/cluster/cold-recovery/evidence', response: responseValue, protocol, auth: { scopes: ['recovery:read'] } })).resolves.toBe(true);
  expect(protocol.evidence).toHaveBeenCalled();
});
test('authorizes status route', async () => {
  const responseValue = response();
  const protocol = { status: jest.fn(async () => 's') };
  await expect(handleColdRecoveryRoute({ method: 'GET', path: '/api/v1/cluster/cold-recovery/status', response: responseValue, protocol, auth: { root: true } })).resolves.toBe(true);
  expect(protocol.status).toHaveBeenCalled();
});
test('authorizes plan route', async () => {
  const responseValue = response();
  const protocol = { plan: jest.fn(async () => 'p') };
  await expect(handleColdRecoveryRoute({ method: 'POST', path: '/api/v1/cluster/cold-recovery/plan', response: responseValue, protocol, auth: { scopes: ['*'] } })).resolves.toBe(true);
  expect(protocol.plan).toHaveBeenCalled();
});
test('protects writes and supports internal authorization', async () => {
  const protocol = { retry: jest.fn(async () => 'r'), authorize: jest.fn(async (body) => body), beginBootstrap: jest.fn(async (body) => body), complete: jest.fn(async (body) => body) };
  const denied = response(); await expect(handleColdRecoveryRoute({ method: 'POST', path: '/api/v1/cluster/cold-recovery/retry', response: denied, protocol, auth: {} })).resolves.toBe(false);
  const retry = response(); await expect(handleColdRecoveryRoute({ method: 'POST', path: '/api/v1/cluster/cold-recovery/retry', response: retry, protocol, internal: true })).resolves.toBe(true);
  const authorize = response(); await expect(handleColdRecoveryRoute({ method: 'POST', path: '/api/v1/cluster/cold-recovery/authorize', response: authorize, protocol, internal: true, request: request({ ok: true }) })).resolves.toBe(true);
  const bootstrap = response(); await expect(handleColdRecoveryRoute({ method: 'POST', path: '/api/v1/cluster/cold-recovery/bootstrap', response: bootstrap, protocol, internal: true, request: request({ ok: true }) })).resolves.toBe(true);
  const complete = response(); await expect(handleColdRecoveryRoute({ method: 'POST', path: '/api/v1/cluster/cold-recovery/complete', response: complete, protocol, internal: true, request: request({ ok: true }) })).resolves.toBe(true);
  await expect(handleColdRecoveryRoute({ method: 'GET', path: '/other', response: response(), protocol, auth: { root: true } })).resolves.toBe(false);
});
test('allows only root administrators to force recovery authorization', async () => {
  const protocol = { authorize: jest.fn(async (body) => body) };
  await expect(handleColdRecoveryRoute({ method: 'POST', path: '/api/v1/cluster/cold-recovery/authorize', request: request({ epoch: 'e', force: true }), response: response(), protocol, auth: { scopes: ['recovery:write'] } })).rejects.toMatchObject({ statusCode: 403 });
  const out = response();
  await expect(handleColdRecoveryRoute({ method: 'POST', path: '/api/v1/cluster/cold-recovery/authorize', request: request({ epoch: 'e', force: true }), response: out, protocol, auth: { root: true } })).resolves.toBe(true);
  expect(protocol.authorize).toHaveBeenCalledWith({ epoch: 'e', force: true });
});
test('supports scoped mutation routes and internal peer access', async () => {
  const protocol = { retry: jest.fn(async () => 'r'), authorize: jest.fn(async (body) => body), beginBootstrap: jest.fn(async (body) => body), complete: jest.fn(async (body) => body) };
  const auth = { scopes: ['recovery:write'] };
  for (const [path, key, status] of [['/api/v1/cluster/cold-recovery/retry', 'retry', 200], ['/api/v1/cluster/cold-recovery/authorize', 'authorize', 202], ['/api/v1/cluster/cold-recovery/bootstrap', 'beginBootstrap', 202], ['/api/v1/cluster/cold-recovery/complete', 'complete', 202]]) {
    const out = response(); await expect(handleColdRecoveryRoute({ method: 'POST', path, request: request({ epoch: 'e' }), response: out, protocol, auth })).resolves.toBe(true); expect(out.json).toHaveBeenCalledWith(status, expect.anything()); expect(protocol[key]).toHaveBeenCalled();
  }
  await expect(handleColdRecoveryRoute({ method: 'GET', path: '/api/v1/cluster/cold-recovery/status', response: response(), protocol, auth: { scopes: [] } })).resolves.toBe(false);
});
test('covers every authenticated recovery operation and protocol absence', async () => {
  const protocol = { evidence: jest.fn(async () => []), status: jest.fn(async () => ({})), plan: jest.fn(async () => ({})), retry: jest.fn(async () => ({})), authorize: jest.fn(async () => ({})), beginBootstrap: jest.fn(async () => ({})), complete: jest.fn(async () => ({})) };
  const auth = { root: true };
  for (const [method, path] of [['GET', '/api/v1/cluster/cold-recovery/evidence'], ['GET', '/api/v1/cluster/cold-recovery/status'], ['POST', '/api/v1/cluster/cold-recovery/plan'], ['POST', '/api/v1/cluster/cold-recovery/retry'], ['POST', '/api/v1/cluster/cold-recovery/authorize'], ['POST', '/api/v1/cluster/cold-recovery/bootstrap'], ['POST', '/api/v1/cluster/cold-recovery/complete']]) await expect(handleColdRecoveryRoute({ method, path, request: request({ epoch: 'e' }), response: response(), protocol, auth })).resolves.toBe(true);
  const unavailable = response(); await expect(handleColdRecoveryRoute({ method: 'GET', path: '/api/v1/cluster/cold-recovery/status', response: unavailable, protocol: undefined, auth })).resolves.toBe(true); expect(unavailable.json).toHaveBeenCalledWith(503, expect.objectContaining({ code: 'RECOVERY_UNAVAILABLE' }));
  await expect(handleColdRecoveryRoute({ method: 'GET', path: '/api/v1/cluster/cold-recovery/status', response: response(), protocol: undefined, auth: {} })).resolves.toBe(false);
});
