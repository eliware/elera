import { readBody } from '../../api/http.mjs';
import { json } from './responses.mjs';

const recoveryPath = (path) => path.startsWith('/api/v1/cluster/cold-recovery/');
export async function handlePendingRecoveryRoute({ request, response, authorized, recoveryRequired, recoveryReason, recoveryProtocol, onRecoveryBootstrap, onRecoveryComplete, onRecoveryJoin, log }) {
  if (!recoveryRequired || !recoveryPath(request.url)) return false;
  if (!authorized(request)) { json(response, 401, { ok: false, error: 'authentication required' }); return true; }
  const path = request.url;
  if (request.method === 'GET' && path.endsWith('/status')) { json(response, 200, { ok: true, operation: 'cluster.cold-recovery.status', data: await recoveryProtocol?.status?.() ?? { phase: 'blocked', reason: recoveryReason } }); return true; }
  if (request.method === 'GET' && path.endsWith('/evidence')) {
    try { json(response, 200, { ok: true, operation: 'cluster.cold-recovery.evidence', data: await recoveryProtocol?.evidence?.() ?? [] }); }
    catch (error) { json(response, 503, { ok: false, error: error.message, code: error.code }); }
    return true;
  }
  if (request.method !== 'POST') return false;
  if (path.endsWith('/plan') || path.endsWith('/retry')) {
    if (!recoveryProtocol) { json(response, 503, { ok: false, error: 'cold recovery is unavailable' }); return true; }
    try { const retry = path.endsWith('/retry'); json(response, 200, { ok: true, operation: `cluster.cold-recovery.${retry ? 'retry' : 'plan'}`, data: await recoveryProtocol[retry ? 'retry' : 'plan']() }); }
    catch (error) { json(response, error.statusCode ?? 503, { ok: false, error: error.message, code: error.code }); }
    return true;
  }
  if (path.endsWith('/authorize') || path.endsWith('/bootstrap') || path.endsWith('/complete')) {
    if (!recoveryProtocol) { json(response, 503, { ok: false, error: 'cold recovery is unavailable' }); return true; }
    let body;
    try { body = await readBody(request); } catch (error) { json(response, 400, { ok: false, error: error.message }); return true; }
    const operation = path.endsWith('/authorize') ? 'authorize' : path.endsWith('/bootstrap') ? 'beginBootstrap' : 'complete';
    if (typeof recoveryProtocol[operation] !== 'function') { json(response, 503, { ok: false, error: `cold recovery operation ${operation} is unavailable` }); return true; }
    try {
      const data = await recoveryProtocol[operation](body);
      if (operation === 'beginBootstrap') response.once('finish', () => Promise.resolve().then(() => onRecoveryBootstrap(data)).catch((error) => log.error?.('Pending recovery bootstrap handoff failed', { error })));
      if (operation === 'complete') response.once('finish', () => Promise.resolve().then(() => onRecoveryComplete(data)).catch((error) => log.error?.('Pending recovery handoff failed', { error })));
      json(response, 202, { ok: true, operation: `cluster.cold-recovery.${operation === 'beginBootstrap' ? 'bootstrap' : operation}`, data });
    } catch (error) { json(response, error.statusCode ?? 409, { ok: false, error: error.message, code: error.code }); }
    return true;
  }
  if (path.endsWith('/join')) {
    let body;
    try { body = await readBody(request); const data = await onRecoveryJoin(body); json(response, 202, { ok: true, operation: 'cluster.cold-recovery.join', data }); }
    catch (error) { json(response, error.statusCode ?? (body ? 409 : 400), { ok: false, error: error.message, code: error.code }); }
    return true;
  }
  return false;
}
