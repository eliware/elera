import { readBody } from '../http.mjs';

const allowed = (auth, scope) => auth?.root || auth?.scopes?.includes('*') || auth?.scopes?.includes(scope);
export async function handleColdRecoveryRoute({ method, path, request, response, protocol, auth, internal = false } = {}) {
  if (!protocol) return false;
  if (method === 'GET' && path === '/api/v1/cluster/cold-recovery/evidence') {
    if (!allowed(auth, 'recovery:read')) return false;
    response.json(200, { ok: true, operation: 'cluster.cold-recovery.evidence', data: await protocol.evidence() });
    return true;
  }
  if (method === 'GET' && path === '/api/v1/cluster/cold-recovery/status') {
    if (!allowed(auth, 'recovery:read')) return false;
    response.json(200, { ok: true, operation: 'cluster.cold-recovery.status', data: await protocol.status() });
    return true;
  }
  if (method === 'POST' && path === '/api/v1/cluster/cold-recovery/plan') {
    if (!allowed(auth, 'recovery:read')) return false;
    response.json(200, { ok: true, operation: 'cluster.cold-recovery.plan', data: await protocol.plan() });
    return true;
  }
  if (method === 'POST' && path === '/api/v1/cluster/cold-recovery/retry') {
    if (!internal && !allowed(auth, 'recovery:write')) return false;
    response.json(200, { ok: true, operation: 'cluster.cold-recovery.retry', data: await protocol.retry() });
    return true;
  }
  if (method === 'POST' && path === '/api/v1/cluster/cold-recovery/authorize') {
    if (!internal && !allowed(auth, 'recovery:write')) return false;
    const body = await readBody(request);
    const force = body.force === true;
    if (force && !auth?.root) throw Object.assign(new Error('forced recovery requires root administrator authorization'), { statusCode: 403 });
    response.json(202, { ok: true, operation: 'cluster.cold-recovery.authorize', data: await protocol.authorize({ ...body, force: force && auth.root }) });
    return true;
  }
  if (method === 'POST' && path === '/api/v1/cluster/cold-recovery/bootstrap') {
    if (!internal && !allowed(auth, 'recovery:write')) return false;
    response.json(202, { ok: true, operation: 'cluster.cold-recovery.bootstrap', data: await protocol.beginBootstrap(await readBody(request)) });
    return true;
  }
  if (method === 'POST' && path === '/api/v1/cluster/cold-recovery/complete') {
    if (!internal && !allowed(auth, 'recovery:write')) return false;
    response.json(202, { ok: true, operation: 'cluster.cold-recovery.complete', data: await protocol.complete(await readBody(request)) });
    return true;
  }
  return false;
}
