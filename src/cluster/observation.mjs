export function createObservation({ nodeId, clusterId, state, synced, primary, health, load = {}, drain = false, address, sqlPort = 3306, observedAt = Date.now(), version = 1 } = {}) {
  if (!nodeId || !clusterId || !state || typeof synced !== 'boolean' || !primary || !health) throw new TypeError('incomplete cluster observation');
  return { version, nodeId, clusterId, state, synced, primary, health, load, drain, address, sqlPort, observedAt };
}
export function isFresh(observation, now = Date.now(), maxAgeMs = 3000) { return now - observation.observedAt <= maxAgeMs; }
