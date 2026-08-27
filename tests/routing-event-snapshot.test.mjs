import { expect, test } from '@jest/globals';
import { createRoutingEventSnapshot } from '../src/routing/event-snapshot.mjs';

test('creates stable versioned routing events and advances on changes', () => {
  const node = { nodeId: 'n', address: 'db', sqlPort: 3306, synced: true, primary: 'Primary', health: 'ok', observedAt: Date.now() };
  const observations = [node]; const snapshot = createRoutingEventSnapshot({ observationStore: { snapshot: () => observations }, environment: { ELERA_CLUSTER_SIZE: '1' } });
  const first = snapshot('app'); expect(first.type).toBe('routing.update'); expect(first.routes.primary[0].host).toBe('db'); expect(snapshot('app')).toBe(first);
  observations[0] = { ...node, drain: true }; expect(snapshot('app').version).toBe(2);
});
test('uses the last healthy routes during a temporary quorum loss and expires them', () => { let now = 1000; let observations = [{ nodeId: 'n', clusterId: 'c', address: 'db', sqlPort: 3306, synced: true, primary: 'Primary', health: 'ok', observedAt: now }]; const snapshot = createRoutingEventSnapshot({ observationStore: { snapshot: () => observations }, environment: { ELERA_CLUSTER_SIZE: '1' }, now: () => now }); const first = snapshot('app'); observations = [{ ...observations[0], synced: false }]; now += 1000; expect(snapshot('app').routes).toEqual(first.routes); now += 5000; expect(snapshot('app').routes.balanced).toEqual([]); });
test('handles missing observations and applications without prior healthy routes', () => { const snapshot = createRoutingEventSnapshot({}); expect(snapshot()).toBeTruthy(); });
