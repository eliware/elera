import { createObservation } from '../cluster/observation.mjs';
import { clientSqlAddress } from './client-address.mjs';

export async function refreshLocalObservation({ observationStore, getStatus, environment = process.env, now = Date.now, address = clientSqlAddress } = {}) {
  if (!observationStore?.upsert || typeof getStatus !== 'function') return;
  const status = await getStatus().catch(() => undefined); if (!status) return;
  const values = status.values ?? {};
  observationStore.upsert(createObservation({ nodeId: environment.RUNTIME_NODE_NAME ?? 'elera', clusterId: 'local-elera', state: values.wsrep_local_state_comment ?? (status.ready ? 'Ready' : 'Down'), synced: values.wsrep_local_state_comment === 'Synced', primary: values.wsrep_cluster_status ?? 'Unknown', health: status.ready ? 'ok' : 'not-ready', load: values, address: address(environment), sqlPort: 3306, observedAt: now() }));
}

export async function refreshPeerObservations({ observationStore, environment = process.env, token = environment.ROOT_TOKEN, fetchImpl = fetch } = {}) {
  const peers = (environment.ELERA_PEERS ?? '').split(',').map((peer) => peer.trim()).filter(Boolean);
  for (const peer of peers) { try { const response = await fetchImpl(`${peer.replace(/\/$/, '')}/api/v1/cluster/observations`, { headers: { accept: 'application/json', authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(500) }); if (!response.ok) continue; for (const item of (await response.json()).data) observationStore.upsert(item); } catch { /* peer refresh is best effort; caller retains its safe fallback */ } }
}
