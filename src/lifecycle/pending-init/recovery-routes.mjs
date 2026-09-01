import { readBody } from '../../api/http.mjs';
import { json } from './responses.mjs';

const recoveryPath = (path) => path.startsWith('/api/v1/cluster/cold-recovery/');
const isFqdn = (value) => typeof value === 'string' && value.length <= 253 && value.includes('.') && !value.endsWith('.') && /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/i.test(value);
export async function handlePendingRecoveryRoute({ request, response, authorized, recoveryRequired, recoveryReason, recoveryProtocol, onRecoveryBootstrap, onRecoveryComplete, onRecoveryJoin, identity, members = [], log }) {
  const path = new URL(request.url, 'http://pending-init.invalid').pathname;
  if (!recoveryRequired || !recoveryPath(path)) return false;
  if (!authorized(request)) { json(response, 401, { ok: false, error: 'authentication required' }); return true; }
  if (request.method === 'GET' && path.endsWith('/status')) {
    try { json(response, 200, { ok: true, operation: 'cluster.cold-recovery.status', data: await recoveryProtocol?.status?.() ?? { phase: 'blocked', reason: recoveryReason } }); }
    catch (error) { json(response, 503, { ok: false, error: error.message, code: error.code }); }
    return true;
  }
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
    try {
      body = await readBody(request);
      if (!isFqdn(body.node)) throw Object.assign(new Error('recovery join node must be a fully qualified hostname'), { statusCode: 400 });
      if (body.node === identity?.name) throw Object.assign(new Error(`recovery join target ${body.node} is the local runtime identity`), { statusCode: 409 });
      if (!members.some((member) => member?.name === body.node)) throw Object.assign(new Error(`recovery join target ${body.node} is not a configured cluster member`), { statusCode: 400 });
      const data = await onRecoveryJoin(body);
      json(response, 202, { ok: true, operation: 'cluster.cold-recovery.join', data });
    }
    catch (error) { json(response, error.statusCode ?? (body ? 409 : 400), { ok: false, error: error.message, code: error.code }); }
    return true;
  }
  return false;
}
