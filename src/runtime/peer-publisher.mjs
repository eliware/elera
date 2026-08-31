export function createPeerPublisher({ health, observationStore, peerClient, node, clusterId, environment = process.env, getDrained = () => false, now = () => Date.now() } = {}) {
  return async function publish() {
    const current = await health.status().catch(() => ({ ready: false, values: {} }));
    const observation = {
      nodeId: node.name,
      clusterId,
      state: current.values?.wsrep_local_state_comment ?? (current.ready ? 'Ready' : 'Down'),
      synced: current.values?.wsrep_local_state_comment === 'Synced',
      primary: current.values?.wsrep_cluster_status ?? 'Unknown',
      health: current.ready ? 'ok' : 'not-ready',
      load: current.values ?? {},
      drain: getDrained(),
      address: node.address(environment),
      sqlPort: Number(environment.ELERA_NODE_SQL_PORT ?? 3306),
      observedAt: now(),
    };
    observationStore.upsert(observation);
    await peerClient.publish(observation);
    await peerClient.refresh();
  };
}
