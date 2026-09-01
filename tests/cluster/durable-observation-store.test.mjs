import { expect, jest, test } from '@jest/globals';
import { createDurableObservationStore } from '../../src/cluster/durable-observation-store.mjs';

const item = { nodeId: 'n1', clusterId: 'c1', state: 'Synced', synced: true, primary: 'Primary', health: 'ready' };
const backing = (accepted = true) => { const values = []; return { values, upsert: (value) => { if (accepted) values.push(value); return { accepted }; }, all: () => values, snapshot: (...args) => ({ values, args }), clear: () => values.splice(0) }; };

test('loads observations and persists accepted updates and clears', async () => {
  const store = backing(); let written;
  const durable = createDurableObservationStore({ store, statePath: '/state/observations.json', read: async () => JSON.stringify([item]), makeDirectory: async () => {}, write: async (_path, value) => { written = value; }, renameFile: async () => {} });
  await durable.initialize();
  expect(durable.all()).toHaveLength(1);
  durable.upsert({ ...item, nodeId: 'n2' }); await durable.flush();
  expect(JSON.parse(written)).toHaveLength(2);
  durable.clear(); await durable.flush(); expect(durable.all()).toEqual([]);
  expect(durable.snapshot('fresh')).toMatchObject({ args: ['fresh'] });
});

test('does not partially restore state when one persisted observation is invalid', async () => {
  const store = backing();
  const durable = createDurableObservationStore({ store, statePath: '/state/invalid-item', read: async () => JSON.stringify([item, { nodeId: 'broken' }]), makeDirectory: async () => {}, log: { warn: jest.fn() } });
  await durable.initialize();
  expect(durable.all()).toEqual([]);
});

test('persists through a temporary file and atomic rename', async () => {
  const store = backing(); const writes = []; const renames = [];
  const durable = createDurableObservationStore({ store, statePath: '/state/atomic.json', makeDirectory: async () => {}, write: async (...args) => writes.push(args), renameFile: async (...args) => renames.push(args) });
  durable.upsert(item); await durable.flush();
  expect(writes[0][0]).toBe('/state/atomic.json.tmp');
  expect(renames).toEqual([['/state/atomic.json.tmp', '/state/atomic.json']]);
});

test('ignores missing state, warns on invalid state and persistence errors', async () => {
  const store = backing(); const warn = jest.fn();
  const missing = createDurableObservationStore({ store, statePath: '/state/missing', read: async () => { throw Object.assign(new Error('missing'), { code: 'ENOENT' }); }, makeDirectory: async () => {}, log: { warn } });
  await missing.initialize();
  const invalid = createDurableObservationStore({ store, statePath: '/state/invalid', read: async () => '[]x', makeDirectory: async () => {}, log: { warn } });
  await invalid.initialize(); expect(warn).toHaveBeenCalled();
  const defaultLogger = createDurableObservationStore({ store, statePath: '/state/default-warning', read: async () => '{}', makeDirectory: async () => {} });
  await defaultLogger.initialize();
  const nonArray = createDurableObservationStore({ store, statePath: '/state/object', read: async () => '{}', makeDirectory: async () => {}, log: { warn } });
  await nonArray.initialize();
  const failing = createDurableObservationStore({ store, statePath: '/state/fail', makeDirectory: async () => { throw new Error('disk full'); }, log: { warn } });
  failing.upsert({ ...item, nodeId: 'n3' }); await failing.flush(); expect(warn).toHaveBeenCalledWith('Observation state persistence failed', expect.anything());
  const rejected = createDurableObservationStore({ store: backing(false), statePath: '/state/rejected', makeDirectory: async () => { throw new Error('should not persist'); } });
  expect(rejected.upsert(item)).toEqual({ accepted: false }); await rejected.flush();
});

test('requires a store and state path', () => expect(() => createDurableObservationStore()).toThrow('store and statePath'));
