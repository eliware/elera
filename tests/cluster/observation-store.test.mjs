import { createObservationStore } from '../../src/cluster/observation-store.mjs';
const item = (observedAt) => ({ nodeId: 'n1', observedAt });
test('deduplicates and rejects stale observations', () => { const store = createObservationStore({ now: () => 100, maxAgeMs: 10 }); expect(store.upsert(item(100)).reason).toBe('added'); expect(store.upsert(item(101)).reason).toBe('updated'); expect(store.upsert(item(99))).toEqual({ accepted: false, reason: 'stale' }); expect(store.snapshot()).toHaveLength(1); });
test('expires old observations and clears state', () => { const store = createObservationStore({ now: () => 100, maxAgeMs: 1 }); store.upsert(item(1)); expect(store.snapshot()).toEqual([]); expect(store.all()).toHaveLength(1); store.clear(); expect(store.all()).toEqual([]); });
test('uses default options', () => { const store = createObservationStore(); expect(store.snapshot()).toEqual([]); });
