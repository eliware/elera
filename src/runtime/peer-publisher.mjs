const isFqdn = (value) => typeof value === 'string' && value.length <= 253 && value.includes('.') && /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/i.test(value);

export function createPeerPublisher({ health, observationStore, peerClient, node, clusterId, environment = process.env, getDrained = () => false, now = () => Date.now() } = {}) {
  if (typeof health?.status !== 'function' || typeof observationStore?.upsert !== 'function' || typeof peerClient?.publish !== 'function' || typeof peerClient?.refresh !== 'function') throw new TypeError('peer publisher dependencies are required');
  if (!isFqdn(node?.name)) throw new TypeError('peer publisher identity must be a fully qualified hostname');
  if (typeof clusterId !== 'string' || !clusterId) throw new TypeError('peer publisher cluster identity is required');
  return async function publish() {
    const current = await health.status().catch(() => ({ ready: false, values: {} }));
    if (!current.ready || current.values?.wsrep_local_state_comment !== 'Synced' || current.values?.wsrep_cluster_status !== 'Primary' || !['ON', true].includes(current.values?.wsrep_ready)) return { published: false, reason: 'not-ready' };
    const observation = {
      nodeId: node.name,
      clusterId,
      state: current.values.wsrep_local_state_comment,
      synced: current.values?.wsrep_local_state_comment === 'Synced',
      primary: current.values.wsrep_cluster_status,
      health: 'ok',
      load: current.values,
      drain: getDrained(),
      address: node.name,
      sqlPort: Number(environment.ELERA_NODE_SQL_PORT ?? 3306),
      observedAt: now(),
    };
    observationStore.upsert(observation);
    await peerClient.publish(observation);
    await peerClient.refresh();
    return { published: true, observation };
  };
}
