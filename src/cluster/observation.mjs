const isFqdn = (value) => typeof value === 'string' && value.length <= 253 && value.includes('.') && value.split('.').every((label) => /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?$/.test(label));
export function createObservation({ nodeId, clusterId, state, synced, primary, health, load = {}, drain = false, address, sqlPort = 3306, observedAt = Date.now(), version = 1 } = {}) {
  if (!isFqdn(nodeId) || !clusterId || !state || typeof synced !== 'boolean' || !primary || !health || (address !== undefined && !isFqdn(address)) || !Number.isFinite(observedAt) || !Number.isInteger(sqlPort) || sqlPort < 1 || sqlPort > 65535) throw new TypeError('incomplete cluster observation');
  if (synced !== (state === 'Synced')) throw new TypeError('observation sync state is inconsistent');
  if (primary !== 'Primary' && primary !== 'Non-Primary') throw new TypeError('observation primary state is invalid');
  return { version, nodeId, clusterId, state, synced, primary, health, load: { ...load }, drain, address, sqlPort, observedAt };
}
export function isFresh(observation, now = Date.now(), maxAgeMs = 3000) { return Boolean(observation && Number.isFinite(observation.observedAt) && Number.isFinite(now) && maxAgeMs >= 0 && now - observation.observedAt <= maxAgeMs); }
