import { isFresh } from './observation.mjs';
export function createObservationStore({ now = Date.now, maxAgeMs = 3000 } = {}) {
  const entries = new Map();
  return {
    upsert(observation) { const current = entries.get(observation.nodeId); if (current && observation.observedAt < current.observedAt) return { accepted: false, reason: 'stale' }; entries.set(observation.nodeId, observation); return { accepted: true, reason: current ? 'updated' : 'added' }; },
    snapshot() { return [...entries.values()].filter((item) => isFresh(item, now(), maxAgeMs)); },
    all() { return [...entries.values()]; },
    clear() { entries.clear(); }
  };
}
