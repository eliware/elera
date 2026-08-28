import { createObservation } from '../../cluster/observation.mjs';
import { evaluateQuorum } from '../../cluster/quorum.mjs';
import { readBody } from '../http.mjs';
export async function handleObservationRoute({ method, path, request, response, environment, getStatus, observations, observationStore }) {
  const store = observationStore ?? { snapshot: () => observations, upsert: (item) => { observations.push(item); return { accepted: true }; } };
  const expectedSize = Number(environment.ELERA_CLUSTER_SIZE ?? (observations.length || 1));
  if (method === 'GET' && path === '/api/v1/cluster/observations') { response.json(200, { ok: true, data: store.snapshot() }); return true; }
  if (method === 'GET' && path === '/api/v1/cluster/quorum') { response.json(200, { ok: true, data: evaluateQuorum(store.snapshot(), { expectedSize }) }); return true; }
  if (method === 'GET' && path === '/api/v1/cluster/topology') { response.json(200, { ok: true, operation: 'cluster.topology', status: 'completed', data: { observations: store.snapshot(), quorum: evaluateQuorum(store.snapshot(), { expectedSize }) } }); return true; }
  if (method === 'POST' && path === '/api/v1/cluster/observations') { const body = await readBody(request); const item = createObservation({ ...body, nodeId: body.nodeId ?? environment.RUNTIME_NODE_NAME ?? 'elera', clusterId: body.clusterId ?? 'local-elera' }); const result = store.upsert(item); if (!result.accepted) { response.json(409, { ok: false, error: result.reason, data: item }); return true; } response.json(202, { ok: true, data: item }); return true; }
  return false;
}
