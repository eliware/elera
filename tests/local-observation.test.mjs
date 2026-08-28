import { expect, jest, test } from '@jest/globals';
import { refreshLocalObservation } from '../src/routing/local-observation.mjs';
import { refreshPeerObservations } from '../src/routing/local-observation.mjs';

test('refreshes the local observation from cached health without SQL discovery', async () => {
  let value; await refreshLocalObservation({ observationStore: { upsert: (item) => { value = item; } }, getStatus: async () => ({ ready: true, values: { wsrep_local_state_comment: 'Synced', wsrep_cluster_status: 'Primary' } }), environment: { RUNTIME_NODE_NAME: 'n' }, address: () => 'db', now: () => 10 });
  expect(value).toMatchObject({ nodeId: 'n', address: 'db', synced: true, primary: 'Primary', observedAt: 10 });
});
test('skips unavailable local status and refreshes peer observations best effort', async () => {
  const store = { upsert: jest.fn() };
  await refreshLocalObservation({ observationStore: {}, getStatus: async () => ({ ready: false }) });
  await refreshLocalObservation({ observationStore: store, getStatus: async () => { throw new Error('down'); } });
  const fetchImpl = jest.fn(async (url) => url.includes('bad') ? { ok: false } : { ok: true, json: async () => ({ data: [{ nodeId: 'peer' }] }) });
  await refreshPeerObservations({ observationStore: store, token: 't', fetchImpl, environment: { ELERA_PEERS: ' http://one/,bad, ' } });
  expect(store.upsert).toHaveBeenCalledWith({ nodeId: 'peer' });
});
test('accepts peer responses without data and peer URLs without trailing slashes', async () => { const store = { upsert: jest.fn() }; const fetchImpl = jest.fn(async () => ({ ok: true, json: async () => ({}) })); await refreshPeerObservations({ observationStore: store, environment: { ELERA_PEERS: 'http://peer' }, fetchImpl }); expect(store.upsert).not.toHaveBeenCalled(); });
test('uses local defaults for sparse status and ignores peer transport failures', async () => {
  const store = { upsert: jest.fn() };
  await refreshLocalObservation({ observationStore: store, getStatus: async () => ({ ready: false }), environment: {}, now: () => 1 });
  expect(store.upsert).toHaveBeenCalledWith(expect.objectContaining({ nodeId: 'elera', synced: false, primary: 'Unknown', health: 'not-ready' }));
  await refreshPeerObservations({ observationStore: store, environment: { ELERA_PEERS: 'http://peer' }, fetchImpl: async () => { throw new Error('network'); } });
});
