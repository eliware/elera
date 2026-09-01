import { createObservation } from '../cluster/observation.mjs';

const isFqdn = (value) => typeof value === 'string' && value.length <= 253 && value.includes('.') && !value.endsWith('.') && /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/i.test(value);

export async function refreshLocalObservation({ observationStore, getStatus, environment = process.env, identity, now = Date.now } = {}) {
  if (!observationStore?.upsert || typeof getStatus !== 'function') throw new TypeError('observation store and status reader are required');
  if (!isFqdn(identity?.name)) throw new TypeError('runtime identity must be a fully qualified hostname');
  const status = await getStatus().catch(() => undefined); if (!status) return;
  const values = status.values ?? {};
  observationStore.upsert(createObservation({ nodeId: identity.name, clusterId: values.wsrep_cluster_uuid ?? values.wsrep_cluster_state_uuid ?? 'unknown', state: values.wsrep_local_state_comment ?? (status.ready ? 'Ready' : 'Down'), synced: values.wsrep_local_state_comment === 'Synced', primary: values.wsrep_cluster_status ?? 'Unknown', health: status.ready ? 'ok' : 'not-ready', load: values, address: identity.name, sqlPort: Number(values.wsrep_node_incoming_address?.split(':').at(-1) ?? 3306), observedAt: now() }));
}

export async function refreshPeerObservations({ observationStore, members = [], identity, httpPort = 8080, environment = process.env, token = environment.ROOT_TOKEN, fetchImpl = fetch } = {}) {
  if (!observationStore?.upsert || typeof fetchImpl !== 'function') throw new TypeError('observation store and fetch implementation are required');
  if (!isFqdn(identity?.name)) throw new TypeError('runtime identity must be a fully qualified hostname');
  if (!Array.isArray(members) || members.length === 0 || members.some((member) => !isFqdn(member?.name) || !isFqdn(member?.address))) throw new TypeError('configured observation members must use FQDN identities and addresses');
  const peers = members.filter((member) => member.name !== identity.name);
  if (peers.length !== members.length - 1) throw new Error('runtime identity must match exactly one configured observation member');
  for (const member of peers) { const peer = member.url ?? `http://${member.address}:${httpPort}`; try { const response = await fetchImpl(`${peer.replace(/\/$/, '')}/api/v1/cluster/observations`, { headers: { accept: 'application/json', authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(500) }); if (!response.ok) continue; const data = await response.json(); if (!Array.isArray(data?.data)) continue; for (const item of data.data) { if (item.nodeId !== member.name || item.address !== member.address) continue; observationStore.upsert(item); } } catch { /* peer refresh is best effort; caller retains its safe fallback */ } }
}
