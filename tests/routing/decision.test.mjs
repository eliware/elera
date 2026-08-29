import { calculateRoutes } from '../../src/routing/decision.mjs';

test('handles missing node metrics and explicit routing overrides', () => {
  expect(calculateRoutes({ application: undefined, observations: [{ nodeId: 'b', synced: true, primary: 'Primary', health: 'ok', address: 'b', observedAt: Date.now() }, { nodeId: 'a', synced: true, primary: 'Primary', health: 'ok', address: 'a', sqlPort: 0, observedAt: Date.now() }] })).toMatchObject({ bundleVersion: expect.any(String) });
  const result = calculateRoutes({ application: 'app', previousWriterHost: 'b', weights: { b: 200 }, observations: [{ nodeId: 'b', synced: true, primary: 'Primary', health: 'ok', address: 'b', observedAt: Date.now(), load: { threads_connected: 1 } }, { nodeId: 'a', synced: true, primary: 'Primary', health: 'ok', address: 'a', observedAt: Date.now(), weight: 50 }] });
  expect(result.primary[0].host).toBe('b');
  expect(calculateRoutes({ application: 'recv', observations: [{ nodeId: 'recv', synced: true, primary: 'Primary', health: 'ok', address: 'recv', observedAt: Date.now(), load: { wsrep_local_recv_queue: 2 } }] }).balanced[0].host).toBe('recv');
});
test('evaluates every route eligibility predicate', () => {
  const base = { nodeId: 'n', synced: true, primary: 'Primary', health: 'ok', address: 'db', sqlPort: 3306, observedAt: Date.now() };
  for (const item of [
    { ...base, synced: false },
    { ...base, primary: 'Non-Primary' },
    { ...base, health: 'not-ready' },
    { ...base, drain: true },
    { ...base, address: undefined },
    { ...base, sqlPort: 0 }
  ]) expect(calculateRoutes({ application: 'eligibility', observations: [item] }).balanced).toEqual([]);
});
test('uses the unknown application label for an empty route set', () => {
  expect(calculateRoutes({ observations: [] })).toEqual({ primary: [], balanced: [], bundleVersion: 'unknown:empty' });
});

const base = { clusterId: 'c', state: 'Synced', synced: true, primary: 'Primary', health: 'ok', observedAt: Date.now() };
test('assigns a deterministic writer and balanced readers', () => {
  const result = calculateRoutes({ application: 'payments', observations: [{ ...base, nodeId: 'a', address: 'a', sqlPort: 3306 }, { ...base, nodeId: 'b', address: 'b', sqlPort: 3306 }] });
  expect(result.primary).toHaveLength(2); expect(result.balanced).toHaveLength(2); expect(result.bundleVersion).toHaveLength(16);
  expect(calculateRoutes({ application: 'payments', observations: [{ ...base, nodeId: 'a', address: 'a', sqlPort: 3306 }, { ...base, nodeId: 'b', address: 'b', sqlPort: 3306 }] }).primary).toEqual(result.primary);
});
test('excludes unsynced, drained, stale, and non-primary nodes', () => {
  const result = calculateRoutes({ application: 'x', observations: [{ ...base, nodeId: 'good', address: 'good', sqlPort: 3306 }, { ...base, nodeId: 'drain', address: 'drain', drain: true }, { ...base, nodeId: 'bad', address: 'bad', synced: false }, { ...base, nodeId: 'old', address: 'old', observedAt: 0 }] });
  expect(result.balanced).toEqual([{ host: 'good', port: 3306, nodeId: 'good' }]);
});
test('returns an empty decision and preserves explicit route weights', () => {
  expect(calculateRoutes({ application: 'x', observations: [] }).balanced).toEqual([]);
  const result = calculateRoutes({ application: 'x', weights: { good: 25 }, observations: [{ nodeId: 'good', address: 'good', sqlPort: 3306, synced: true, primary: 'Primary', health: 'ok', observedAt: Date.now() }] });
  expect(result.primary[0].weight).toBe(25);
});
test('uses a previous writer when it remains within the load preference window', () => { const now = Date.now(); const observations = [{ ...base, nodeId: 'busy', address: 'busy', load: { threads_connected: 10 }, weight: 1, observedAt: now }, { ...base, nodeId: 'light', address: 'light', load: { threads_connected: 1 }, observedAt: now }]; expect(calculateRoutes({ application: 'x', previousWriterHost: 'light', observations, now }).primary[0].host).toBe('light'); });
test('keeps a persisted writer despite load and ignores malformed nodes', () => { const now = Date.now(); const observations = [{ ...base, nodeId: 'busy', address: 'busy', load: { wsrep_local_recv_queue: 100 }, weight: 1, observedAt: now }, { ...base, nodeId: 'light', address: 'light', observedAt: now }, { ...base, nodeId: 'none', address: '', observedAt: now }, { ...base, nodeId: 'port', address: 'port', sqlPort: 0, observedAt: now }]; expect(calculateRoutes({ application: 'x', previousWriterHost: 'busy', observations, now }).primary[0].host).toBe('busy'); });
test('uses explicit writer selection and ordered failover with node identity', () => { const now = Date.now(); const routes = calculateRoutes({ application: 'x', observations: [{ ...base, nodeId: 'a', address: 'a', observedAt: now }, { ...base, nodeId: 'b', address: 'b', observedAt: now }], previousWriterHost: 'b', now }); expect(routes.writer).toEqual({ host: 'b', port: 3306, nodeId: 'b' }); expect(routes.failover).toEqual([{ host: 'a', port: 3306, nodeId: 'a' }]); expect(routes.primary.every(({ weight }) => weight === undefined)).toBe(true); });
test('uses defaults for omitted application, ports, weights, and load values', () => { const result = calculateRoutes({ observations: [{ nodeId: 'n', address: 'n', synced: true, primary: 'Primary', health: 'ok', observedAt: Date.now() }] }); expect(result.primary[0]).toEqual({ host: 'n', port: 3306, nodeId: 'n' }); expect(result.bundleVersion).toHaveLength(16); });
test('preserves explicit route weights without using them as writer selection', () => {
  const now = Date.now();
  const result = calculateRoutes({ application: 'app', observations: [
    { ...base, nodeId: 'a', address: 'a', observedAt: now },
    { ...base, nodeId: 'b', address: 'b', observedAt: now },
  ], now });
  expect(result.primary).toHaveLength(2);
  expect(result.primary.every(({ weight }) => weight === undefined)).toBe(true);
});
