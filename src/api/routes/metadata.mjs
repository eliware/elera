import { readBody } from '../http.mjs';
export async function handleMetadataRoute({ method, path, request, response, metadata }) {
  if (method === 'GET' && path === '/api/v1/metadata/status') { response.json(200, { ok: true, operation: 'metadata.status', data: await metadata.status() }); return true; }
  if (method === 'POST' && path === '/api/v1/metadata/initialize') { const body = await readBody(request); if (body.confirm !== true) throw Object.assign(new Error('metadata initialization requires confirm: true'), { statusCode: 409 }); const data = await metadata.initialize(); response.json(200, { ok: true, operation: 'metadata.initialize', status: 'completed', data }); return true; }
  if (method === 'POST' && path === '/api/v1/metadata/verify') { const data = await metadata.verify(); response.json(data.verified ? 200 : 503, { ok: data.verified, operation: 'metadata.verify', data }); return true; }
  return false;
}
