import { readBody } from '../http.mjs';

const allowed = (auth, scope) => auth?.root || auth?.scopes?.includes('*') || auth?.scopes?.includes(scope);

export async function handleRecoveryRoute({ method, path, request, response, recovery, auth } = {}) {
  if (!recovery) return false;
  if (method === 'GET' && path === '/api/v1/recovery/status') { if (!allowed(auth, 'recovery:read')) return false; response.json(200, { ok: true, operation: 'recovery.status', data: recovery.status() }); return true; }
  if (method === 'GET' && path === '/api/v1/recovery/events') { if (!allowed(auth, 'recovery:read')) return false; response.json(200, { ok: true, operation: 'recovery.events', data: recovery.events() }); return true; }
  if (method === 'POST' && (path === '/api/v1/recovery/acknowledge' || path === '/api/v1/recovery/abort')) {
    const scope = path.endsWith('abort') ? 'recovery:abort' : 'recovery:acknowledge';
    if (!allowed(auth, scope)) return false;
    const body = await readBody(request);
    if (body.confirm !== true) throw Object.assign(new Error(`${path.endsWith('abort') ? 'recovery abort' : 'recovery acknowledgement'} requires confirm: true`), { statusCode: 409 });
    const data = path.endsWith('abort') ? recovery.abort(body.reason) : recovery.acknowledge(body.reason);
    response.json(202, { ok: true, operation: path.endsWith('abort') ? 'recovery.abort' : 'recovery.acknowledge', data });
    return true;
  }
  return false;
}
