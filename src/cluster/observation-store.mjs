import { isFresh } from './observation.mjs';
const isFqdn = (value) => typeof value === 'string' && value.length <= 253 && value.includes('.') && value.split('.').every((label) => /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?$/.test(label));
export function createObservationStore({ now = Date.now, maxAgeMs = 3000 } = {}) {
  const entries = new Map();
  return {
    upsert(observation) {
      if (!observation || !isFqdn(observation.nodeId)) return { accepted: false, reason: 'invalid-identity' };
      if (!Number.isFinite(observation.observedAt)) return { accepted: false, reason: 'invalid-timestamp' };
      const current = entries.get(observation.nodeId);
      if (current && observation.observedAt < current.observedAt) return { accepted: false, reason: 'stale' };
      entries.set(observation.nodeId, { ...observation });
      return { accepted: true, reason: current ? 'updated' : 'added' };
    },
    snapshot() { return [...entries.values()].filter((item) => isFresh(item, now(), maxAgeMs)).map((item) => ({ ...item })); },
    all() { return [...entries.values()].map((item) => ({ ...item })); },
    clear() { entries.clear(); }
  };
}
