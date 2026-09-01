const isFqdn = (value) => typeof value === 'string' && value.length <= 253 && value.includes('.') && value.split('.').every((label) => /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?$/.test(label));
export function shutdownCondition({ clusterSize = 1, observations = [], localNodeId } = {}) {
  const size = Number(clusterSize);
  if (!Number.isInteger(size) || size <= 1) return 'standalone';
  const active = [...new Map((Array.isArray(observations) ? observations : []).filter((item) => isFqdn(item?.nodeId) && item.synced === true && item.primary === 'Primary' && item.health === 'ok' && item.drain !== true).map((item) => [item.nodeId, item])).values()];
  if (active.length === 0) return 'total-cluster-unavailable';
  if (active.length === 1 && active[0].nodeId === localNodeId) return 'last-survivor';
  return 'cluster-member';
}
