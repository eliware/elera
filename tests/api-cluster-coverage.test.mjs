import { expect, jest, test } from '@jest/globals';
import { handleClusterRoute } from '../src/api/routes/cluster.mjs';

const response = () => ({ json: jest.fn() });
const request = (body = {}) => ({ async *[Symbol.asyncIterator]() { yield JSON.stringify(body); } });
const context = (method, path, body = {}, overrides = {}) => ({ method, path, url: new URL(path, 'http://localhost'), request: request(body), response: response(), getStatus: async () => ({ ready: true }), getConfig: () => ({ elera: true, clusterSize: 3, runtimeNodeName: 'node' }), ...overrides });

test('handles cluster status, eligibility, wait-ready, and lifecycle plans', async () => {
  for (const [method, path, body] of [['GET', '/api/v1/cluster/status'], ['GET', '/api/v1/cluster/bootstrap/eligibility'], ['POST', '/api/v1/cluster/bootstrap/plan'], ['GET', '/api/v1/cluster/wait-ready?timeoutMs=1'], ['POST', '/api/v1/cluster/lifecycle/plan', { action: 'join', target: 'peer', quorum: true, synced: true }]]) { const actualPath = path.split('?')[0]; expect(await handleClusterRoute(context(method, actualPath, body, { url: new URL(path, 'http://localhost') }))).toBe(true); }
  const lifecycle = { execute: jest.fn(async () => ({ status: 'completed' })) };
  await expect(handleClusterRoute(context('POST', '/api/v1/cluster/lifecycle/apply', { action: 'drain' }, { lifecycle }))).resolves.toBe(true);
  expect(lifecycle.execute).toHaveBeenCalled();
});

test('handles bootstrap confirmation, disabled mode, and unavailable lifecycle', async () => {
  await expect(handleClusterRoute(context('POST', '/api/v1/cluster/bootstrap', { confirm: true }, { bootstrap: jest.fn() }))).resolves.toBe(true);
  await expect(handleClusterRoute(context('POST', '/api/v1/cluster/bootstrap', { confirm: true }, { getConfig: () => ({ elera: false, clusterSize: 1 }), bootstrap: jest.fn() }))).rejects.toMatchObject({ statusCode: 409 });
  await expect(handleClusterRoute(context('POST', '/api/v1/cluster/lifecycle/apply', { action: 'drain' }))).rejects.toMatchObject({ statusCode: 503 });
});
test('handles failed readiness polling and non-eligible bootstrap states', async () => {
  await expect(handleClusterRoute(context('GET', '/api/v1/cluster/wait-ready', {}, { url: new URL('/api/v1/cluster/wait-ready?timeoutMs=1', 'http://localhost'), getStatus: async () => { throw new Error('unavailable'); } }))).resolves.toBe(true);
  await expect(handleClusterRoute(context('GET', '/api/v1/cluster/bootstrap/eligibility', {}, { getConfig: () => ({ elera: false, clusterSize: 1 }), getStatus: async () => ({ ready: true }) }))).resolves.toBe(true);
});
test('refuses ordinary bootstrap eligibility for initialized non-Primary data', async () => {
  const context = { method: 'GET', path: '/api/v1/cluster/bootstrap/eligibility', request: {}, response: { json: jest.fn() }, url: new URL('http://localhost'), getConfig: () => ({ elera: true, clusterSize: 3 }), getStatus: async () => ({ ready: false, values: { wsrep_local_state_comment: 'Initialized', wsrep_cluster_status: 'non-Primary' } }) };
  await expect(handleClusterRoute(context)).resolves.toBe(true);
  expect(context.response.json).toHaveBeenCalledWith(200, expect.objectContaining({ eligible: false, reason: expect.stringContaining('initialized') }));
});
test('uses the default readiness timeout parameter', async () => {
  await expect(handleClusterRoute(context('GET', '/api/v1/cluster/wait-ready', {}, { getStatus: async () => ({ ready: true }) }))).resolves.toBe(true);
});
test('plans and executes explicit cold bootstrap', async () => {
  const coldBootstrap = { plan: jest.fn(async () => ({ eligible: true, candidate: 'node' })), execute: jest.fn(async (body) => ({ confirmed: body.confirm === true })) };
  await expect(handleClusterRoute(context('POST', '/api/v1/cluster/cold-bootstrap/plan', {}, { coldBootstrap }))).resolves.toBe(true);
  await expect(handleClusterRoute(context('POST', '/api/v1/cluster/cold-bootstrap', { confirm: true }, { coldBootstrap }))).resolves.toBe(true);
  expect(coldBootstrap.plan).toHaveBeenCalled();
  expect(coldBootstrap.execute).toHaveBeenCalledWith({ confirm: true });
});
test('rejects unavailable cold bootstrap', async () => {
  await expect(handleClusterRoute(context('POST', '/api/v1/cluster/cold-bootstrap/plan'))).rejects.toMatchObject({ statusCode: 503 });
  await expect(handleClusterRoute(context('POST', '/api/v1/cluster/cold-bootstrap', {}))).rejects.toMatchObject({ statusCode: 503 });
});
test('serves local cold-bootstrap evidence', async () => {
  const coldEvidence = jest.fn(async () => ({ node: 'node', active: false, state: { seqno: 4 } }));
  await expect(handleClusterRoute(context('GET', '/api/v1/cluster/cold-bootstrap/evidence', {}, { coldEvidence }))).resolves.toBe(true);
  expect(coldEvidence).toHaveBeenCalled();
});
test('executes local cold bootstrap only with confirmation', async () => {
  const coldBootstrapLocal = jest.fn(async () => {});
  await expect(handleClusterRoute(context('POST', '/api/v1/cluster/cold-bootstrap/local', { confirm: true }, { coldBootstrapLocal, internal: true }))).resolves.toBe(true);
  await expect(handleClusterRoute(context('POST', '/api/v1/cluster/cold-bootstrap/local', {} , { coldBootstrapLocal, internal: true }))).rejects.toMatchObject({ statusCode: 409 });
  expect(coldBootstrapLocal).toHaveBeenCalledTimes(1);
});
