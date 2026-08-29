import { expect, jest, test } from '@jest/globals';
import { createControlApi } from '../src/control-api.mjs';

const request = (method, url, body = {}) => ({ method, url, headers: { authorization: 'Bearer root_token_here' }, async *[Symbol.asyncIterator]() { if (method === 'POST') yield JSON.stringify(body); } });
const response = () => ({ status: 0, body: '', writeHead(status) { this.status = status; return this; }, end(body = '') { this.body = body; return this; } });

test('routes the complete control surface through its composed handlers', async () => {
  const status = { ready: true, values: {} }; const store = { snapshot: () => [], upsert: () => ({ accepted: true }) };
  const managed = { listDatabases: async () => [], listIdentities: async () => [], createDatabase: async () => ({}), createIdentity: async () => ({}), rotateIdentity: async () => ({}), issueToken: async () => ({}), revokeToken: async () => ({}), revokeIdentity: async () => ({}), lease: async () => ({ database: 'app', identity: 'id', username: 'u', password: 'p', routes: { primary: [{ host: 'db', port: 3306 }] }, expiresAt: '2099-01-01' }), authenticate: async () => null };
  const reconciler = { plan: async () => ({}), apply: async () => ({}), verify: async () => ({ verified: true }) };
  const api = createControlApi({ db: { query: async () => [[]] }, getStatus: async () => status, getTraffic: () => ({}), setDrain: jest.fn(), bootstrap: async () => {}, lifecycle: { execute: async () => ({ status: 'completed' }) }, getActiveIntent: Object.assign(async () => ({}), { apply: async () => ({}), verify: async () => ({ verified: true }) }), leaseCredentials: async () => ({ credentials: { username: 'u', password: 'p' }, database: 'app', routes: { primary: [{ host: 'db', port: 3306 }] }, expiresAt: '2099-01-01' }), routingBundles: { get: async () => ({}) }, routingEvent: jest.fn(), metadata: { status: async () => ({}), initialize: async () => ({}), verify: async () => ({ verified: true }), authenticate: async () => null }, managed, reconciler, observationStore: store, environment: { ROOT_TOKEN: 'root_token_here', ELERA_CLUSTER_MODE: '1', MARIADB_DATABASE: 'app', MARIADB_USER: 'u' } });
  const calls = [['POST', '/api/v1/config/apply', { confirm: true }], ['POST', '/api/v1/config/verify'], ['GET', '/api/v1/metadata/status'], ['POST', '/api/v1/metadata/initialize', { confirm: true }], ['POST', '/api/v1/metadata/verify'], ['GET', '/api/v1/cluster/observations'], ['GET', '/api/v1/cluster/quorum'], ['GET', '/api/v1/cluster/topology'], ['POST', '/api/v1/cluster/observations'], ['POST', '/api/v1/cluster/lifecycle/plan', { action: 'drain' }], ['POST', '/api/v1/cluster/lifecycle/apply', { action: 'drain' }], ['POST', '/api/v1/credentials/lease', { database: 'app', identity: 'id' }], ['POST', '/api/v1/credentials/refresh', { identity: 'id' }], ['POST', '/api/v1/credentials/revoke', { identity: 'id' }], ['GET', '/api/v1/routes'], ['POST', '/api/v1/routes/refresh'], ['GET', '/api/v1/routing/bundle?identity=id'], ['GET', '/api/v1/routing/resync?application=app']];
  for (const [method, url, body] of calls) { const out = response(); await api.handler(request(method, url, body), out); expect(out.status).toBeGreaterThanOrEqual(200); }
});

test('does not invoke cold bootstrap while composing an unrelated request', async () => {
  const coldBootstrap = jest.fn();
  const api = createControlApi({
    environment: { ROOT_TOKEN: 'root_token_here' },
    getStatus: async () => ({ ready: false, values: {} }),
    getColdBootstrapLocal: () => coldBootstrap,
  });
  const out = response();
  await api.handler(request('GET', '/api/v1/cluster/status', {}), out);
  expect(out.status).toBe(200);
  expect(coldBootstrap).not.toHaveBeenCalled();
});

test('handles authentication, unavailable services, and request errors', async () => {
  const out = response(); const api = createControlApi({ environment: { ROOT_TOKEN: 'root' }, log: { error: jest.fn() } });
  await api.handler({ method: 'GET', url: '/api/v1/status', headers: {} }, out); expect(out.status).toBe(401);
  const bad = response(); await api.handler({ method: 'GET', url: '/not-api', headers: {} }, bad); expect(bad.status).toBe(0);

  const authorizedRequest = (method, url, body = {}) => ({ ...request(method, url, body), headers: { authorization: 'Bearer root' } });
  const makeApi = (overrides = {}) => createControlApi({
    db: { query: async () => [[]] }, getStatus: async () => ({ ready: false }),
    leaseCredentials: undefined, managed: undefined, environment: { ROOT_TOKEN: 'root', ELERA_CLUSTER_MODE: '0' },
    log: { error: jest.fn() }, ...overrides
  });
  const unavailable = makeApi();
  const lease = response(); await unavailable.handler(authorizedRequest('POST', '/api/v1/credentials/lease', { database: 'app', identity: 'id' }), lease); expect(lease.status).toBe(501);
  const refresh = response(); await unavailable.handler(authorizedRequest('POST', '/api/v1/credentials/refresh', { identity: 'id' }), refresh); expect(refresh.status).toBe(501);
  const revoke = response(); await unavailable.handler(authorizedRequest('POST', '/api/v1/credentials/revoke', { identity: 'id' }), revoke); expect(revoke.status).toBe(501);
  const failed = makeApi({ leaseCredentials: async () => { throw Object.assign(new Error('bad request'), { statusCode: 422 }); } }); const failedOut = response(); await failed.handler(authorizedRequest('POST', '/api/v1/credentials/lease', { database: 'app', identity: 'id' }), failedOut); expect(failedOut.status).toBe(422);
  const managed = makeApi({ managed: { lease: async () => ({ database: 'app', identity: 'id', username: 'u', password: 'p', host: 'db', port: 3306, routes: { primary: [{ host: 'db', port: 3306 }], balanced: [{ host: 'db', port: 3306 }] }, expiresAt: '2099-01-01' }), revokeIdentity: async () => ({ revoked: true }) } });
  const refreshOut = response(); await managed.handler(authorizedRequest('POST', '/api/v1/credentials/refresh', { identity: 'id' }), refreshOut); expect(refreshOut.status).toBe(200);
  const unknownOut = response(); await managed.handler(authorizedRequest('GET', '/api/v1/unknown'), unknownOut); expect(unknownOut.status).toBe(404);
  const errorOut = response(); const failing = makeApi({ getStatus: async () => { throw new Error('status failure'); } }); await failing.handler(authorizedRequest('GET', '/api/v1/cluster/status'), errorOut); expect(errorOut.status).toBe(500);
  const requestIdOut = response(); const requestWithId = authorizedRequest('GET', '/api/v1/unknown'); requestWithId.headers['x-request-id'] = 'test-request'; await managed.handler(requestWithId, requestIdOut); expect(requestIdOut.status).toBe(404);
  const rawErrorOut = response(); const rawFailing = makeApi({ getStatus: async () => { throw 'raw status failure'; } }); await rawFailing.handler(authorizedRequest('GET', '/api/v1/cluster/status'), rawErrorOut); expect(rawErrorOut.status).toBe(500);
  const scopedApi = makeApi({ metadata: { authenticate: async () => ({ scopes: ['metadata:read'] }) } }); const scopedRequest = { ...request('GET', '/api/v1/unknown'), headers: { authorization: 'Bearer scoped-token' } }; const scopedOut = response(); await scopedApi.handler(scopedRequest, scopedOut); expect(scopedOut.status).toBe(404);
});

test('exposes recovery and routing administration through the authenticated API', async () => {
  const recovery = {
    status: jest.fn(() => ({ state: 'pending' })),
    events: jest.fn(() => []),
    acknowledge: jest.fn(() => ({ state: 'recovery-authorized' })),
    abort: jest.fn(() => ({ state: 'cluster-unavailable' })),
  };
  const routingBundles = {
    validate: jest.fn(async ({ application }) => ({ valid: true, application })),
    rebalance: jest.fn(async ({ application }) => ({ recalculated: true, application })),
  };
  const api = createControlApi({
    environment: { ROOT_TOKEN: 'root' },
    recovery,
    routingBundles,
    routingEvent: () => ({ type: 'routing.update', version: 1 }),
  });
  const authorized = (method, url, body = {}) => ({ ...request(method, url, body), headers: { authorization: 'Bearer root' } });
  for (const [method, url, body] of [
    ['GET', '/api/v1/recovery/status'],
    ['GET', '/api/v1/recovery/events'],
    ['POST', '/api/v1/recovery/acknowledge', { confirm: true }],
    ['POST', '/api/v1/recovery/abort', { confirm: true }],
    ['GET', '/api/v1/routing/validate?application=app'],
    ['GET', '/api/v1/routing/events?application=app'],
    ['POST', '/api/v1/routing/rebalance', { confirm: true, application: 'app' }],
  ]) {
    const out = response();
    await api.handler(authorized(method, url, body), out);
    expect(out.status).toBeGreaterThanOrEqual(200);
  }
  expect(recovery.acknowledge).toHaveBeenCalled();
  expect(recovery.abort).toHaveBeenCalled();
  expect(routingBundles.validate).toHaveBeenCalledWith({ application: 'app', identity: undefined });
  expect(routingBundles.rebalance).toHaveBeenCalledWith({ confirm: true, application: 'app', identity: undefined });
});
