import { createObservation } from '../../cluster/observation.mjs';
import { evaluateQuorum } from '../../cluster/quorum.mjs';
import { readBody } from '../http.mjs';
const isFqdn = (value) => typeof value === 'string' && value.length <= 253 && value.includes('.') && /[A-Za-z]/.test(value) && value.split('.').every((label) => /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?$/.test(label));
export async function handleObservationRoute({ method, path, request, response, environment, getConfig, getStatus, observations, observationStore, identity, peerIdentity }) {
  if (!identity?.name) throw new Error('runtime identity is required for observation routes');
  const store = observationStore ?? { snapshot: () => observations, upsert: (item) => { observations.push(item); return { accepted: true }; } };
  const expectedSize = Number(getConfig?.().clusterSize ?? (observations.length || 1));
  if (method === 'GET' && path === '/api/v1/cluster/observations') { response.json(200, { ok: true, data: store.snapshot() }); return true; }
  if (method === 'GET' && path === '/api/v1/cluster/quorum') { response.json(200, { ok: true, data: evaluateQuorum(store.snapshot(), { expectedSize }) }); return true; }
  if (method === 'GET' && path === '/api/v1/cluster/topology') { response.json(200, { ok: true, operation: 'cluster.topology', status: 'completed', data: { observations: store.snapshot(), quorum: evaluateQuorum(store.snapshot(), { expectedSize }) } }); return true; }
  if (method === 'POST' && path === '/api/v1/cluster/observations') { const body = await readBody(request); if (!body.nodeId) throw Object.assign(new Error('observation nodeId is required'), { statusCode: 400 }); if (!isFqdn(body.nodeId) || (body.address !== undefined && (!isFqdn(body.address) || body.address !== body.nodeId))) throw Object.assign(new Error(`observation identity must use one matching FQDN: nodeId=${body.nodeId}; address=${body.address ?? '<missing>'}`), { statusCode: 400 }); if (peerIdentity && body.nodeId !== peerIdentity.name) throw Object.assign(new Error(`observation identity mismatch: authenticated peer=${peerIdentity.name}; declared nodeId=${body.nodeId}`), { statusCode: 409 }); const item = createObservation({ ...body, clusterId: body.clusterId ?? 'local-elera' }); const result = store.upsert(item); if (!result.accepted) { response.json(409, { ok: false, error: result.reason, data: item }); return true; } response.json(202, { ok: true, data: item }); return true; }
  return false;
}
