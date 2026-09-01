import { createObservationStore } from '../../src/cluster/observation-store.mjs';
const item = (observedAt) => ({ nodeId: 'elera-1.example.test', observedAt });
test('deduplicates and rejects stale observations', () => { const store = createObservationStore({ now: () => 100, maxAgeMs: 10 }); expect(store.upsert(item(100)).reason).toBe('added'); expect(store.upsert(item(101)).reason).toBe('updated'); expect(store.upsert(item(99))).toEqual({ accepted: false, reason: 'stale' }); expect(store.snapshot()).toHaveLength(1); });
test('expires old observations and clears state', () => { const store = createObservationStore({ now: () => 100, maxAgeMs: 1 }); store.upsert(item(1)); expect(store.snapshot()).toEqual([]); expect(store.all()).toHaveLength(1); store.clear(); expect(store.all()).toEqual([]); });
test('uses default options', () => { const store = createObservationStore(); expect(store.snapshot()).toEqual([]); });
test('rejects invalid identities and timestamps and protects stored values', () => {
  const store = createObservationStore({ now: () => 100 });
  expect(store.upsert({ nodeId: 'n1', observedAt: 100 })).toEqual({ accepted: false, reason: 'invalid-identity' });
  expect(store.upsert({ nodeId: 'elera-1.example.test', observedAt: NaN })).toEqual({ accepted: false, reason: 'invalid-timestamp' });
  const value = item(100); store.upsert(value); value.state = 'mutated';
  expect(store.all()[0].state).toBeUndefined();
  const snapshot = store.snapshot(); snapshot[0].nodeId = 'changed.example.test';
  expect(store.all()[0].nodeId).toBe('elera-1.example.test');
});
