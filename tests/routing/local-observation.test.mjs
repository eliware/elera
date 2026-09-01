import { expect, jest, test } from '@jest/globals';
import { refreshLocalObservation } from '../../src/routing/local-observation.mjs';
import { refreshPeerObservations } from '../../src/routing/local-observation.mjs';

test('refreshes the local observation from cached health without SQL discovery', async () => {
  let value; await refreshLocalObservation({ observationStore: { upsert: (item) => { value = item; } }, getStatus: async () => ({ ready: true, values: { wsrep_local_state_comment: 'Synced', wsrep_cluster_status: 'Primary' } }), identity: { name: 'n' }, address: () => 'db', now: () => 10 });
  expect(value).toMatchObject({ nodeId: 'n', address: 'n', synced: true, primary: 'Primary', observedAt: 10 });
});
test('skips unavailable local status and refreshes peer observations best effort', async () => {
  const store = { upsert: jest.fn() };
  await refreshLocalObservation({ observationStore: {}, getStatus: async () => ({ ready: false }), identity: { name: 'n' } });
  await refreshLocalObservation({ observationStore: store, getStatus: async () => { throw new Error('down'); }, identity: { name: 'n' } });
  const fetchImpl = jest.fn(async (url) => url.includes('bad') ? { ok: false } : { ok: true, json: async () => ({ data: [{ nodeId: 'peer' }] }) });
  await refreshPeerObservations({ observationStore: store, token: 't', fetchImpl, environment: { ELERA_PEERS: ' http://one/,bad, ' } });
  expect(store.upsert).toHaveBeenCalledWith({ nodeId: 'peer' });
});
test('rejects peer responses without an observation array', async () => { const store = { upsert: jest.fn() }; const fetchImpl = jest.fn(async () => ({ ok: true, json: async () => ({}) })); await refreshPeerObservations({ observationStore: store, environment: { ELERA_PEERS: 'http://peer' }, fetchImpl }); expect(store.upsert).not.toHaveBeenCalled(); });
test('uses local defaults for sparse status and ignores peer transport failures', async () => {
  const store = { upsert: jest.fn() };
  await refreshLocalObservation({ observationStore: store, getStatus: async () => ({ ready: false }), identity: { name: 'n' }, environment: {}, now: () => 1 });
  expect(store.upsert).toHaveBeenCalledWith(expect.objectContaining({ nodeId: 'n', synced: false, primary: 'Unknown', health: 'not-ready' }));
  await refreshPeerObservations({ observationStore: store, environment: { ELERA_PEERS: 'http://peer' }, fetchImpl: async () => { throw new Error('network'); } });
});
test('uses Ready as the state when a ready status has no wsrep state', async () => {
  const store = { upsert: jest.fn() };
  await refreshLocalObservation({ observationStore: store, getStatus: async () => ({ ready: true }), identity: { name: 'n' }, environment: {}, now: () => 1 });
  expect(store.upsert).toHaveBeenCalledWith(expect.objectContaining({ state: 'Ready' }));
});
test('does not perform peer work when no peers are configured', async () => {
  const fetchImpl = jest.fn();
  await refreshPeerObservations({ environment: {}, fetchImpl, observationStore: { upsert: jest.fn() } });
  expect(fetchImpl).not.toHaveBeenCalled();
});
test('ignores successful peer responses with null data and non-success responses', async () => {
  const store = { upsert: jest.fn() };
  const fetchImpl = jest.fn(async (url) => url.includes('empty') ? { ok: true, json: async () => ({ data: null }) } : { ok: false, status: 503 });
  await refreshPeerObservations({ environment: { ELERA_PEERS: 'http://empty,http://unavailable' }, fetchImpl, token: 't', observationStore: store });
  expect(store.upsert).not.toHaveBeenCalled();
});
test('accepts an explicitly empty peer observation list', async () => {
  const store = { upsert: jest.fn() };
  await refreshPeerObservations({ environment: { ELERA_PEERS: 'http://peer' }, fetchImpl: async () => ({ ok: true, json: async () => ({ data: [] }) }), observationStore: store });
  expect(store.upsert).not.toHaveBeenCalled();
});
test('uses the configured root token when no token override is supplied', async () => {
  const fetchImpl = jest.fn(async () => ({ ok: true, json: async () => ({ data: [] }) }));
  await refreshPeerObservations({ environment: { ELERA_PEERS: 'http://peer', ROOT_TOKEN: 'root-token' }, fetchImpl, observationStore: { upsert: jest.fn() } });
  expect(fetchImpl.mock.calls[0][1].headers.authorization).toBe('Bearer root-token');
});
