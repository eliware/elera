import { createObservation } from '../../cluster/observation.mjs';
import { evaluateQuorum } from '../../cluster/quorum.mjs';
import { readBody } from '../http.mjs';
export async function handleObservationRoute({ method, path, request, response, environment, getStatus, observations }) {
  if (method === 'GET' && path === '/api/v1/cluster/observations') { response.json(200, { ok: true, data: observations }); return true; }
  if (method === 'GET' && path === '/api/v1/cluster/quorum') { response.json(200, { ok: true, data: evaluateQuorum(observations) }); return true; }
  if (method === 'POST' && path === '/api/v1/cluster/observations') { const body = await readBody(request); const item = createObservation({ ...body, nodeId: body.nodeId ?? environment.ELERA_NODE_NAME ?? 'elera', clusterId: body.clusterId ?? environment.ELERA_CLUSTER_NAME ?? 'local-elera' }); observations.push(item); response.json(202, { ok: true, data: item }); return true; }
  return false;
}
