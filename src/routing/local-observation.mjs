import { createObservation } from '../cluster/observation.mjs';

export async function refreshLocalObservation({ observationStore, getStatus, environment = process.env, now = Date.now } = {}) {
  if (!observationStore?.upsert || typeof getStatus !== 'function') return;
  const status = await getStatus().catch(() => undefined); if (!status) return;
  const values = status.values ?? {};
  observationStore.upsert(createObservation({ nodeId: environment.ELERA_NODE_NAME ?? 'elera', clusterId: environment.ELERA_CLUSTER_NAME ?? 'local-elera', state: values.wsrep_local_state_comment ?? (status.ready ? 'Ready' : 'Down'), synced: values.wsrep_local_state_comment === 'Synced', primary: values.wsrep_cluster_status ?? 'Unknown', health: status.ready ? 'ok' : 'not-ready', load: values, address: environment.ELERA_NODE_ADDRESS ?? '127.0.0.1', sqlPort: Number(environment.ELERA_NODE_SQL_PORT ?? 3306), observedAt: now() }));
}
