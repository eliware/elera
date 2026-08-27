import { expect, test } from '@jest/globals';
import { refreshLocalObservation } from '../src/routing/local-observation.mjs';

test('refreshes the local observation from cached health without SQL discovery', async () => {
  let value; await refreshLocalObservation({ observationStore: { upsert: (item) => { value = item; } }, getStatus: async () => ({ ready: true, values: { wsrep_local_state_comment: 'Synced', wsrep_cluster_status: 'Primary' } }), environment: { ELERA_NODE_NAME: 'n', ELERA_CLUSTER_NAME: 'c', ELERA_NODE_ADDRESS: 'db' }, now: () => 10 });
  expect(value).toMatchObject({ nodeId: 'n', address: 'db', synced: true, primary: 'Primary', observedAt: 10 });
});
