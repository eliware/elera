import { readBody } from '../http.mjs';
export async function handleColdBootstrapLocal({ method, path, request, response, coldBootstrapLocal, internal = false }) {
  if (method !== 'POST' || path !== '/api/v1/cluster/cold-bootstrap/local') return false;
  if (!internal) throw Object.assign(new Error('local cold bootstrap is internal-only'), { statusCode: 403 });
  if (typeof coldBootstrapLocal !== 'function') throw Object.assign(new Error('local cold bootstrap is unavailable'), { statusCode: 503 });
  const body = await readBody(request);
  if (body.confirm !== true) throw Object.assign(new Error('local cold bootstrap requires confirm: true'), { statusCode: 409 });
  await coldBootstrapLocal();
  response.json(202, { ok: true, operation: 'cluster.cold-bootstrap.local', status: 'completed' });
  return true;
}
