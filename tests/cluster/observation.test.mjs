import { expect, test } from '@jest/globals';
import { createObservation, isFresh } from '../../src/cluster/observation.mjs';

test('creates a normalized observation with defaults', () => {
    expect(createObservation({ nodeId: 'elera-1.example.test', clusterId: 'c1', state: 'Synced', synced: true, primary: 'Primary', health: 'ready' })).toMatchObject({ nodeId: 'elera-1.example.test', sqlPort: 3306, load: {}, drain: false, version: 1 });
});
test('rejects incomplete observations and applies freshness boundary', () => {
  expect(() => createObservation({ nodeId: 'elera-1' })).toThrow('incomplete cluster observation');
  const item = createObservation({ nodeId: 'elera-1.example.test', clusterId: 'c1', state: 'Synced', synced: true, primary: 'Primary', health: 'ready', observedAt: 100 });
  expect(isFresh(item, 3100, 3000)).toBe(true);
  expect(isFresh(item, 3101, 3000)).toBe(false);
});

test('preserves explicit observation values', () => {
  const item = createObservation({ nodeId: 'elera-2.example.test', clusterId: 'c2', state: 'Joining', synced: false, primary: 'Non-Primary', health: 'degraded', load: { queries: 2 }, drain: true, address: 'node-2.example.test', sqlPort: 13306, observedAt: 500, version: 3 });
  expect(item).toEqual({ version: 3, nodeId: 'elera-2.example.test', clusterId: 'c2', state: 'Joining', synced: false, primary: 'Non-Primary', health: 'degraded', load: { queries: 2 }, drain: true, address: 'node-2.example.test', sqlPort: 13306, observedAt: 500 });
  expect(isFresh(item, 500, 0)).toBe(true);
  expect(isFresh(item, 499, 0)).toBe(true);
});

test('requires every identity and state field', () => {
  const valid = { nodeId: 'elera-1.example.test', clusterId: 'c', state: 'Synced', synced: true, primary: 'Primary', health: 'ready' };
  for (const field of ['nodeId', 'clusterId', 'state', 'primary', 'health']) expect(() => createObservation({ ...valid, [field]: '' })).toThrow('incomplete cluster observation');
  expect(() => createObservation({ ...valid, synced: undefined })).toThrow('incomplete cluster observation');
});

test('rejects inconsistent readiness and non-FQDN addresses', () => {
  const valid = { nodeId: 'elera-1.example.test', clusterId: 'c', state: 'Synced', synced: true, primary: 'Primary', health: 'ready' };
  expect(() => createObservation({ ...valid, synced: false })).toThrow('inconsistent');
  expect(() => createObservation({ ...valid, address: '127.0.0.1' })).toThrow('incomplete');
  expect(() => createObservation({ ...valid, primary: 'ready' })).toThrow('invalid');
  expect(isFresh({ observedAt: Number.NaN }, 100)).toBe(false);
});
