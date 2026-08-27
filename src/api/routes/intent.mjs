import { intentHash, loadIntent, planIntent } from '../../intent/model.mjs';
import { readBody } from '../http.mjs';

export async function handleIntentRoute({ method, path, request, response, environment, getActiveIntent }) {
  if (method === 'GET' && path === '/api/v1/config/intent') { const intent = loadIntent(environment); response.json(200, { ok: true, operation: 'config.intent', status: 'completed', data: { intent, desiredHash: intentHash(intent) } }); return true; }
  if (method === 'POST' && path === '/api/v1/config/plan') { const body = await readBody(request); const desired = body.intent ?? body; const active = typeof getActiveIntent === 'function' ? await getActiveIntent() : null; response.json(200, { ok: true, operation: 'config.plan', status: 'planned', data: planIntent(desired, active) }); return true; }
  return false;
}
