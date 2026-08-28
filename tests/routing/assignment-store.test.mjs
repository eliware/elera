import { expect, test } from '@jest/globals';
import { createAssignmentStore } from '../../src/routing/assignment-store.mjs';

test('persists application writer assignments atomically', async () => {
  const files = new Map();
  const store = createAssignmentStore({ path: 'state/assignments.json', read: async (path) => { if (!files.has(path)) throw Object.assign(new Error('missing'), { code: 'ENOENT' }); return files.get(path); }, write: async (path, value) => files.set(path, value), move: async (from, to) => files.set(to, files.get(from)), makeDirectory: async () => {} });
  await store.set('app', 'elera-1');
  expect(await store.get('app')).toBe('elera-1');
  expect(JSON.parse(files.get('state/assignments.json'))).toEqual({ app: 'elera-1' }); expect(store.peek('app')).toBe('elera-1'); expect(store.applications()).toEqual(['app']);
});
test('loads persisted assignments and supports memory-only stores', async () => { const store = createAssignmentStore({ path: 'state.json', read: async () => JSON.stringify({ app: 'elera-2' }) }); expect(await store.get('app')).toBe('elera-2'); const memory = createAssignmentStore(); await memory.set('app', 'elera-1'); expect(await memory.get('app')).toBe('elera-1'); });
test('surfaces persisted-state read failures', async () => { const store = createAssignmentStore({ path: 'state.json', read: async () => { throw new Error('read failed'); } }); await expect(store.get('app')).rejects.toThrow('read failed'); });
