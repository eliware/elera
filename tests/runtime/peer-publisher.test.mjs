import { expect, jest, test } from '@jest/globals';
import { createPeerPublisher } from '../../src/runtime/peer-publisher.mjs';

test('does not publish observations while the supervisor is not ready', async () => {
  const publish = jest.fn();
  const result = await createPeerPublisher({ health: { status: async () => ({ ready: false }) }, observationStore: { upsert: jest.fn() }, peerClient: { publish, refresh: jest.fn() }, node: { name: 'a.example.test', address: () => 'a.example.test' }, clusterId: 'c' })();
  expect(result).toEqual({ published: false, reason: 'not-ready' });
  expect(publish).not.toHaveBeenCalled();
});

test('publishes a normalized local observation to peers', async () => {
  const observations = [];
  const calls = [];
  const publish = createPeerPublisher({
    health: { status: async () => ({ ready: true, values: { wsrep_local_state_comment: 'Synced', wsrep_cluster_status: 'Primary', wsrep_ready: 'ON' } }) },
    observationStore: { upsert: (value) => observations.push(value) },
    peerClient: { publish: async (value) => calls.push(['publish', value]), refresh: async () => calls.push(['refresh']) },
    node: { name: 'node-1.example.test', address: () => 'node-1.example.test' }, clusterId: 'cluster', getDrained: () => true, now: () => 123,
  });
  await publish();
  expect(observations[0]).toMatchObject({ nodeId: 'node-1.example.test', clusterId: 'cluster', synced: true, primary: 'Primary', drain: true, observedAt: 123 });
  expect(calls.map(([name]) => name)).toEqual(['publish', 'refresh']);
});

test('uses safe fallback when health is unavailable', async () => {
  let received;
  const publish = createPeerPublisher({ health: { status: async () => { throw new Error('down'); } }, observationStore: { upsert: (value) => { received = value; } }, peerClient: { publish: async () => {}, refresh: async () => {} }, node: { name: 'node.example.test', address: () => 'node.example.test' }, clusterId: 'c' });
  await publish();
  expect(received).toBeUndefined();
});

test('uses ready fallback and default load when status has no values', async () => {
  let received;
  const publish = createPeerPublisher({ health: { status: async () => ({ ready: true, values: { wsrep_local_state_comment: 'Synced', wsrep_cluster_status: 'Primary', wsrep_ready: 'ON' } }) }, observationStore: { upsert: (value) => { received = value; } }, peerClient: { publish: async () => {}, refresh: async () => {} }, node: { name: 'node.example.test', address: () => 'node.example.test' }, clusterId: 'c' });
  await publish();
  expect(received).toMatchObject({ state: 'Synced', load: {}, health: 'ok', sqlPort: 3306 });
});

test('validates publisher dependencies and readiness gates', async () => {
  expect(() => createPeerPublisher()).toThrow('dependencies');
  const base = { health: { status: jest.fn(async () => ({ ready: true, values: { wsrep_local_state_comment: 'Synced', wsrep_cluster_status: 'Primary', wsrep_ready: true } })) }, observationStore: { upsert: jest.fn() }, peerClient: { publish: jest.fn(), refresh: jest.fn() }, node: { name: 'node.example.test' }, clusterId: 'c' };
  expect(() => createPeerPublisher({ ...base, node: { name: 'node' } })).toThrow('fully qualified');
  expect(() => createPeerPublisher({ ...base, clusterId: '' })).toThrow('cluster identity');
  const publisher = createPeerPublisher({ ...base, environment: { ELERA_NODE_SQL_PORT: '13306' }, now: () => 5 });
  await expect(publisher()).resolves.toMatchObject({ published: true, observation: { sqlPort: 13306, observedAt: 5 } });
  base.health.status.mockResolvedValueOnce({ ready: true, values: { wsrep_local_state_comment: 'Joining', wsrep_cluster_status: 'Primary', wsrep_ready: 'ON' } });
  await expect(createPeerPublisher(base)()).resolves.toEqual({ published: false, reason: 'not-ready' });
  for (const values of [{}, { wsrep_local_state_comment: 'Synced' }, { wsrep_local_state_comment: 'Synced', wsrep_cluster_status: 'Primary' }, { wsrep_local_state_comment: 'Synced', wsrep_cluster_status: 'Primary', wsrep_ready: 'OFF' }]) {
    await expect(createPeerPublisher({ ...base, health: { status: jest.fn(async () => ({ ready: true, values })) } })()).resolves.toEqual({ published: false, reason: 'not-ready' });
  }
});
