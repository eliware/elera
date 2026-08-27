import { intentHash, loadIntent, planIntent } from '../../intent/model.mjs';
import { readBody } from '../http.mjs';

export async function handleIntentRoute({ method, path, request, response, environment, getActiveIntent }) {
  if (method === 'GET' && path === '/api/v1/config/intent') { const intent = loadIntent(environment); response.json(200, { ok: true, operation: 'config.intent', status: 'completed', data: { intent, desiredHash: intentHash(intent) } }); return true; }
  if (method === 'POST' && path === '/api/v1/config/plan') { const body = await readBody(request); const desired = body.intent ?? body; const active = typeof getActiveIntent === 'function' ? await getActiveIntent() : null; response.json(200, { ok: true, operation: 'config.plan', status: 'planned', data: planIntent(desired, active) }); return true; }
  if (method === 'POST' && path === '/api/v1/config/apply') { const body = await readBody(request); if (body.confirm !== true) throw Object.assign(new Error('config apply requires confirm: true'), { statusCode: 409 }); if (!getActiveIntent?.apply) throw Object.assign(new Error('config state is not configured'), { statusCode: 503 }); response.json(200, { ok: true, operation: 'config.apply', status: 'completed', data: await getActiveIntent.apply(body.intent ?? body) }); return true; }
  if (method === 'POST' && path === '/api/v1/config/verify') { if (!getActiveIntent?.verify) throw Object.assign(new Error('config state is not configured'), { statusCode: 503 }); response.json(200, { ok: true, operation: 'config.verify', status: 'completed', data: await getActiveIntent.verify(loadIntent(environment)) }); return true; }
  return false;
}
