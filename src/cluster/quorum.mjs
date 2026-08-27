import { isFresh } from './observation.mjs';
export function evaluateQuorum(observations, { now = Date.now(), maxAgeMs = 3000, expectedSize = observations.length } = {}) {
  const fresh = observations.filter((item) => isFresh(item, now, maxAgeMs)); const clusters = new Set(fresh.map((item) => item.clusterId)); const primaries = new Set(fresh.map((item) => item.primary));
  const required = Math.floor(Number(expectedSize) / 2) + 1; const clusterId = clusters.size === 1 ? fresh[0]?.clusterId : null; const primary = primaries.size === 1 ? fresh[0]?.primary : null; const quorum = fresh.length >= required && clusters.size === 1 && primaries.size === 1;
  return { quorum, clusterId, primary, observations: fresh, required, reason: quorum ? 'quorum-established' : fresh.length < required ? 'insufficient-fresh-observations' : clusters.size !== 1 ? 'conflicting-clusters' : 'conflicting-primaries' };
}
