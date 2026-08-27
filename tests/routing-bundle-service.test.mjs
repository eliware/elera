import { createRoutingBundleService } from '../src/routing/bundle-service.mjs';

test('combines managed credentials with current eligible routes', async () => {
  const service = createRoutingBundleService({ managed: { lease: async () => ({ application: 'app', database: 'db', identity: 'id', username: 'u', password: 'p', routes: { primary: [{ host: 'fallback', port: 3306 }], balanced: [{ host: 'fallback', port: 3306 }] }, expiresAt: '2099-01-01T00:00:00Z' }) }, observationStore: { snapshot: () => [{ nodeId: 'n', address: 'node', sqlPort: 3306, synced: true, primary: 'Primary', health: 'ok', observedAt: Date.now() }] } });
  const result = await service.lease({ identity: 'id' });
  expect(result.routes.primary[0].host).toBe('node'); expect(result.credentials.username).toBe('u');
});
test('requires both dependencies and retains fallback routes when no node is eligible', async () => {
  expect(() => createRoutingBundleService()).toThrow();
  const service = createRoutingBundleService({ managed: { lease: async () => ({ application: 'app', database: 'db', identity: 'id', username: 'u', password: 'p', routes: { primary: [{ host: 'fallback', port: 3306 }], balanced: [{ host: 'fallback', port: 3306 }] }, expiresAt: '2099-01-01T00:00:00Z' }) }, observationStore: { snapshot: () => [] } });
  expect((await service.lease({ identity: 'id' })).routes.primary[0].host).toBe('fallback');
});
test('reuses a recent application route calculation and falls back to request application', async () => { let now = 100; const managed = { lease: async (request) => ({ database: 'db', identity: request.identity, username: 'u', password: 'p', routes: { primary: [{ host: 'fallback', port: 3306 }], balanced: [] }, expiresAt: '2099-01-01' }) }; const observationStore = { snapshot: () => [] }; const service = createRoutingBundleService({ managed, observationStore, now: () => now }); await service.lease({ application: 'app', identity: 'id' }); await service.lease({ application: 'app', identity: 'id' }); now += 1001; await service.lease({ application: 'app', identity: 'id' }); });
test('uses the default application and bundle version when metadata omits them', async () => { const service = createRoutingBundleService({ managed: { lease: async () => ({ database: 'db', identity: 'id', username: 'u', password: 'p', expiresAt: '2099-01-01', routes: { primary: [], balanced: [] } }) }, observationStore: { snapshot: () => [] } }); const result = await service.lease({}); expect(result.bundleVersion).toBe(1); });
