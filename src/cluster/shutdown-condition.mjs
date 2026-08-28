export function shutdownCondition({ clusterSize = 1, observations = [], localNodeId } = {}) {
  if (Number(clusterSize) <= 1) return 'standalone';
  const active = observations.filter((item) => item.nodeId && item.synced && item.primary === 'Primary' && item.health === 'ok' && !item.drain);
  if (active.length === 0) return 'total-cluster-unavailable';
  if (active.length === 1 && active[0].nodeId === localNodeId) return 'last-survivor';
  return 'cluster-member';
}
