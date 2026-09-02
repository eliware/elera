import { expect, test } from '@jest/globals';
import { createAssignmentStore } from '../../src/routing/assignment-store.mjs';

test('persists application writer assignments atomically', async () => {
  const files = new Map();
  const store = createAssignmentStore({ path: 'state/assignments.json', read: async (path) => { if (!files.has(path)) throw Object.assign(new Error('missing'), { code: 'ENOENT' }); return files.get(path); }, write: async (path, value) => files.set(path, value), move: async (from, to) => files.set(to, files.get(from)), makeDirectory: async () => {} });
  await store.set('app', 'elera-1.cluster.local');
  expect(await store.get('app')).toBe('elera-1.cluster.local');
  expect(JSON.parse(files.get('state/assignments.json'))).toEqual({ app: 'elera-1.cluster.local' }); expect(store.peek('app')).toBe('elera-1.cluster.local'); expect(store.applications()).toEqual(['app']);
});
test('loads persisted assignments and supports memory-only stores', async () => { const store = createAssignmentStore({ path: 'state.json', read: async () => JSON.stringify({ app: 'elera-2.cluster.local' }) }); expect(await store.get('app')).toBe('elera-2.cluster.local'); const memory = createAssignmentStore(); await memory.set('app', 'elera-1.cluster.local'); expect(await memory.get('app')).toBe('elera-1.cluster.local'); });
test('surfaces persisted-state read failures', async () => { const store = createAssignmentStore({ path: 'state.json', read: async () => { throw new Error('read failed'); } }); await expect(store.get('app')).rejects.toThrow('read failed'); });

test('loads every persisted assignment and exposes absent values', async () => {
  const store = createAssignmentStore({ path: 'state.json', read: async () => JSON.stringify({ one: 'node-1.example.test', two: 'node-2.example.test' }) });
  expect(store.peek('one')).toBeUndefined();
  expect(await store.get('missing')).toBeUndefined();
  expect(store.applications()).toEqual(['one', 'two']);
  expect(store.peek('two')).toBe('node-2.example.test');
});

test('ignores a missing optional state file but rejects malformed state', async () => {
  const missing = createAssignmentStore({ path: 'state.json', read: async () => { throw Object.assign(new Error('missing'), { code: 'ENOENT' }); } });
  await expect(missing.get('app')).resolves.toBeUndefined();
  const malformed = createAssignmentStore({ path: 'state.json', read: async () => '{bad' });
  await expect(malformed.get('app')).rejects.toThrow();
});

test('surfaces atomic persistence failures', async () => {
  const store = createAssignmentStore({ path: 'state.json', read: async () => JSON.stringify({}), makeDirectory: async () => {}, write: async () => { throw new Error('write failed'); } });
  await expect(store.set('app', 'node')).rejects.toThrow('write failed');
  const moved = createAssignmentStore({ path: 'state.json', read: async () => JSON.stringify({}), makeDirectory: async () => {}, write: async () => {}, move: async () => { throw new Error('rename failed'); } });
  await expect(moved.set('app', 'node')).rejects.toThrow('rename failed');
});
