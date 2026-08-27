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
