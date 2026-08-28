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
test('uses the default readiness timeout parameter', async () => {
  await expect(handleClusterRoute(context('GET', '/api/v1/cluster/wait-ready', {}, { getStatus: async () => ({ ready: true }) }))).resolves.toBe(true);
});
