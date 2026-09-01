import { readBody } from '../http.mjs';
import { planLifecycle } from '../../cluster/lifecycle-plan.mjs';
import { handleColdBootstrapEvidence } from './cold-bootstrap-evidence.mjs';
import { handleColdBootstrapLocal } from './cold-bootstrap-local.mjs';
import { bootstrapEligibility } from '../../cluster/bootstrap-eligibility.mjs';

export async function handleClusterRoute({ method, path, request, response, url, getStatus, bootstrap, lifecycle, getConfig, identity, coldBootstrap, coldEvidence, coldBootstrapLocal, internal = false }) {
  const config = getConfig?.() ?? {};
  const enabled = config.elera ?? config.clusterSize > 1;
  if (!identity?.name) throw new Error('runtime identity is required for cluster routes');
  const nodeId = identity.name;
  if (await handleColdBootstrapEvidence({ method, path, response, coldEvidence })) return true;
  if (await handleColdBootstrapLocal({ method, path, request, response, coldBootstrapLocal, internal })) return true;
  if (method === 'GET' && path === '/api/v1/cluster/status') { response.json(200, { ok: true, operation: 'cluster.status', status: 'completed', data: await getStatus() }); return true; }
  if (method === 'GET' && path === '/api/v1/cluster/bootstrap/eligibility') { const data = await getStatus(); const decision = bootstrapEligibility({ enabled, ready: data.ready, state: data.values?.wsrep_local_state_comment }); response.json(200, { ok: true, ...decision, data }); return true; }
  if (method === 'POST' && path === '/api/v1/cluster/bootstrap/plan') { const data = await getStatus(); response.json(200, { ok: true, operation: 'cluster.bootstrap', changed: false, status: 'planned', eligible: enabled && !data.ready, data }); return true; }
  if (method === 'GET' && path === '/api/v1/cluster/wait-ready') { const deadline = Date.now() + Math.min(Number(url.searchParams.get('timeoutMs') ?? 60000), 300000); let data; do { data = await getStatus().catch(() => ({ ready: false })); if (data.ready) { response.json(200, { ok: true, operation: 'cluster.wait-ready', status: 'ready', data }); return true; } await new Promise((resolve) => setTimeout(resolve, Math.min(1000, Math.max(1, deadline - Date.now())))); } while (Date.now() < deadline); response.json(408, { ok: false, operation: 'cluster.wait-ready', status: 'timeout', data }); return true; }
  if (method === 'POST' && path === '/api/v1/cluster/bootstrap') { const body = await readBody(request); if (body.confirm !== true) throw Object.assign(new Error('bootstrap requires confirm: true'), { statusCode: 409 }); const data = await getStatus(); const eligibility = bootstrapEligibility({ enabled, ready: data.ready, state: data.values?.wsrep_local_state_comment }); if (!eligibility.eligible) throw Object.assign(new Error(eligibility.reason), { statusCode: 409, code: 'BOOTSTRAP_NOT_ELIGIBLE' }); if (typeof bootstrap !== 'function') throw Object.assign(new Error('bootstrap is unavailable'), { statusCode: 503 }); await bootstrap(); response.json(202, { ok: true, operation: 'cluster.bootstrap', changed: true, status: 'completed', data: { identity: nodeId } }); return true; }
  if (method === 'POST' && path === '/api/v1/cluster/cold-bootstrap/plan') { if (!coldBootstrap) throw Object.assign(new Error('cold bootstrap is unavailable'), { statusCode: 503 }); response.json(200, { ok: true, operation: 'cluster.cold-bootstrap.plan', status: 'planned', data: await coldBootstrap.plan() }); return true; }
  if (method === 'POST' && path === '/api/v1/cluster/cold-bootstrap') { if (!coldBootstrap) throw Object.assign(new Error('cold bootstrap is unavailable'), { statusCode: 503 }); const body = await readBody(request); response.json(202, { ok: true, operation: 'cluster.cold-bootstrap', status: 'completed', data: await coldBootstrap.execute(body) }); return true; }
  if (method === 'POST' && path === '/api/v1/cluster/lifecycle/plan') { const body = await readBody(request); response.json(200, { ok: true, operation: `cluster.${body.action}.plan`, status: 'planned', data: planLifecycle(body.action, { enabled, ready: (await getStatus()).ready, quorum: body.quorum === true, synced: body.synced === true, nodeId, target: body.target }) }); return true; }
  if (method === 'POST' && path === '/api/v1/cluster/lifecycle/apply') { const body = await readBody(request); if (!lifecycle) throw Object.assign(new Error('lifecycle manager is unavailable'), { statusCode: 503 }); const data = await lifecycle.execute(body.action, body); response.json(202, { ok: true, operation: `cluster.${body.action}.apply`, ...data }); return true; }
  return false;
}
