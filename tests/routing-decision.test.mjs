import { calculateRoutes } from '../src/routing/decision.mjs';

const base = { clusterId: 'c', state: 'Synced', synced: true, primary: 'Primary', health: 'ok', observedAt: Date.now() };
test('assigns a deterministic writer and balanced readers', () => {
  const result = calculateRoutes({ application: 'payments', observations: [{ ...base, nodeId: 'a', address: 'a', sqlPort: 3306 }, { ...base, nodeId: 'b', address: 'b', sqlPort: 3306 }] });
  expect(result.primary).toHaveLength(2); expect(result.balanced).toHaveLength(2); expect(result.bundleVersion).toHaveLength(16);
  expect(calculateRoutes({ application: 'payments', observations: [{ ...base, nodeId: 'a', address: 'a', sqlPort: 3306 }, { ...base, nodeId: 'b', address: 'b', sqlPort: 3306 }] }).primary).toEqual(result.primary);
});
test('excludes unsynced, drained, stale, and non-primary nodes', () => {
  const result = calculateRoutes({ application: 'x', observations: [{ ...base, nodeId: 'good', address: 'good', sqlPort: 3306 }, { ...base, nodeId: 'drain', address: 'drain', drain: true }, { ...base, nodeId: 'bad', address: 'bad', synced: false }, { ...base, nodeId: 'old', address: 'old', observedAt: 0 }] });
  expect(result.balanced).toEqual([{ host: 'good', port: 3306, weight: 100 }]);
});
test('returns an empty decision when quorum has no eligible node and honors weights', () => {
  expect(calculateRoutes({ application: 'x', observations: [] }).balanced).toEqual([]);
  const result = calculateRoutes({ application: 'x', weights: { good: 25 }, observations: [{ nodeId: 'good', address: 'good', sqlPort: 3306, synced: true, primary: 'Primary', health: 'ok', observedAt: Date.now() }] });
  expect(result.primary[0].weight).toBe(25);
});
