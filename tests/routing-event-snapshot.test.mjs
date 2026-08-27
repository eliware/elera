import { expect, test } from '@jest/globals';
import { createRoutingEventSnapshot } from '../src/routing/event-snapshot.mjs';

test('creates stable versioned routing events and advances on changes', () => {
  const node = { nodeId: 'n', address: 'db', sqlPort: 3306, synced: true, primary: 'Primary', health: 'ok', observedAt: Date.now() };
  const observations = [node]; const snapshot = createRoutingEventSnapshot({ observationStore: { snapshot: () => observations }, environment: { ELERA_CLUSTER_SIZE: '1' } });
  const first = snapshot('app'); expect(first.type).toBe('routing.update'); expect(first.routes.primary[0].host).toBe('db'); expect(snapshot('app')).toBe(first);
  observations[0] = { ...node, drain: true }; expect(snapshot('app').version).toBe(2);
});
