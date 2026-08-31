import { expect, test } from '@jest/globals';
import { createPeerPublisher } from '../../src/runtime/peer-publisher.mjs';

test('publishes a normalized local observation to peers', async () => {
  const observations = [];
  const calls = [];
  const publish = createPeerPublisher({
    health: { status: async () => ({ ready: true, values: { wsrep_local_state_comment: 'Synced', wsrep_cluster_status: 'Primary' } }) },
    observationStore: { upsert: (value) => observations.push(value) },
    peerClient: { publish: async (value) => calls.push(['publish', value]), refresh: async () => calls.push(['refresh']) },
    node: { name: 'node-1', address: () => '10.0.0.1' }, clusterId: 'cluster', getDrained: () => true, now: () => 123,
  });
  await publish();
  expect(observations[0]).toMatchObject({ nodeId: 'node-1', clusterId: 'cluster', synced: true, primary: 'Primary', drain: true, observedAt: 123 });
  expect(calls.map(([name]) => name)).toEqual(['publish', 'refresh']);
});

test('uses safe fallback when health is unavailable', async () => {
  let received;
  const publish = createPeerPublisher({ health: { status: async () => { throw new Error('down'); } }, observationStore: { upsert: (value) => { received = value; } }, peerClient: { publish: async () => {}, refresh: async () => {} }, node: { name: 'node', address: () => 'addr' }, clusterId: 'c' });
  await publish();
  expect(received).toMatchObject({ state: 'Down', health: 'not-ready', synced: false, primary: 'Unknown' });
});

test('uses ready fallback and default load when status has no values', async () => {
  let received;
  const publish = createPeerPublisher({ health: { status: async () => ({ ready: true }) }, observationStore: { upsert: (value) => { received = value; } }, peerClient: { publish: async () => {}, refresh: async () => {} }, node: { name: 'node', address: () => 'addr' }, clusterId: 'c' });
  await publish();
  expect(received).toMatchObject({ state: 'Ready', load: {}, health: 'ok', sqlPort: 3306 });
});
