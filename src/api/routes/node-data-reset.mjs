import { readBody } from '../http.mjs';
export async function handleNodeDataResetRoute({ method, path, request, response, auth, nodeDataReset } = {}) {
  if (method !== 'POST' || path !== '/api/v1/node/data/reset') return false;
  if (!auth?.root) return false;
  const data = await nodeDataReset.reset(await readBody(request));
  response.json(data.dryRun ? 200 : 202, { ok: true, operation: 'node.data.reset', status: data.status, data });
  return true;
}
