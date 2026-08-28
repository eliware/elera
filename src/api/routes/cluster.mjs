import { readBody } from '../http.mjs';
import { planLifecycle } from '../../cluster/lifecycle-plan.mjs';
import { runtimeIdentity } from '../../runtime/identity.mjs';

export async function handleClusterRoute({ method, path, request, response, url, getStatus, bootstrap, lifecycle, getConfig }) {
  const config = getConfig?.() ?? {};
  const enabled = config.elera ?? config.clusterSize > 1;
  const nodeId = config.runtimeNodeName ?? runtimeIdentity().name;
  if (method === 'GET' && path === '/api/v1/cluster/status') { response.json(200, { ok: true, operation: 'cluster.status', status: 'completed', data: await getStatus() }); return true; }
  if (method === 'GET' && path === '/api/v1/cluster/bootstrap/eligibility') { const data = await getStatus(); const eligible = enabled && !data.ready; response.json(200, { ok: true, eligible, reason: eligible ? 'node is Elera-enabled and not ready' : 'requires clustered configuration and a non-ready node', data }); return true; }
  if (method === 'POST' && path === '/api/v1/cluster/bootstrap/plan') { const data = await getStatus(); response.json(200, { ok: true, operation: 'cluster.bootstrap', changed: false, status: 'planned', eligible: enabled && !data.ready, data }); return true; }
  if (method === 'GET' && path === '/api/v1/cluster/wait-ready') { const deadline = Date.now() + Math.min(Number(url.searchParams.get('timeoutMs') ?? 60000), 300000); let data; do { data = await getStatus().catch(() => ({ ready: false })); if (data.ready) { response.json(200, { ok: true, operation: 'cluster.wait-ready', status: 'ready', data }); return true; } await new Promise((resolve) => setTimeout(resolve, Math.min(1000, Math.max(1, deadline - Date.now())))); } while (Date.now() < deadline); response.json(408, { ok: false, operation: 'cluster.wait-ready', status: 'timeout', data }); return true; }
  if (method === 'POST' && path === '/api/v1/cluster/bootstrap') { const body = await readBody(request); if (body.confirm !== true) throw Object.assign(new Error('bootstrap requires confirm: true'), { statusCode: 409 }); if (!enabled) throw Object.assign(new Error('clustered configuration is required'), { statusCode: 409 }); if (typeof bootstrap !== 'function') throw Object.assign(new Error('bootstrap is unavailable'), { statusCode: 503 }); await bootstrap(); response.json(202, { ok: true, operation: 'cluster.bootstrap', changed: true, status: 'completed' }); return true; }
  if (method === 'POST' && path === '/api/v1/cluster/lifecycle/plan') { const body = await readBody(request); response.json(200, { ok: true, operation: `cluster.${body.action}.plan`, status: 'planned', data: planLifecycle(body.action, { enabled, ready: (await getStatus()).ready, quorum: body.quorum === true, synced: body.synced === true, nodeId, target: body.target }) }); return true; }
  if (method === 'POST' && path === '/api/v1/cluster/lifecycle/apply') { const body = await readBody(request); if (!lifecycle) throw Object.assign(new Error('lifecycle manager is unavailable'), { statusCode: 503 }); const data = await lifecycle.execute(body.action, body); response.json(202, { ok: true, operation: `cluster.${body.action}.apply`, ...data }); return true; }
  return false;
}
