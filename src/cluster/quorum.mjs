import { createObservation, isFresh } from './observation.mjs';
export function evaluateQuorum(observations, { now = Date.now(), maxAgeMs = 3000, expectedSize = observations.length } = {}) {
  const input = Array.isArray(observations) ? observations : [];
  const valid = input.flatMap((item) => { try { return [createObservation(item)]; } catch { return []; } });
  const fresh = valid.filter((item) => isFresh(item, now, maxAgeMs));
  const unique = [...new Map(fresh.map((item) => [item.nodeId, item])).values()];
  const clusters = new Set(unique.map((item) => item.clusterId)); const primaries = new Set(unique.map((item) => item.primary));
  const numericExpected = Number(expectedSize); const required = Number.isInteger(numericExpected) && numericExpected > 0 ? Math.floor(numericExpected / 2) + 1 : 1;
  const clusterId = clusters.size === 1 ? unique[0]?.clusterId : null; const primary = primaries.size === 1 ? unique[0]?.primary : null; const quorum = unique.length >= required && clusters.size === 1 && primaries.size === 1;
  return { quorum, clusterId, primary, observations: unique, required, reason: quorum ? 'quorum-established' : valid.length !== input.length ? 'invalid-observations' : unique.length < required ? 'insufficient-fresh-observations' : clusters.size !== 1 ? 'conflicting-clusters' : 'conflicting-primaries' };
}
