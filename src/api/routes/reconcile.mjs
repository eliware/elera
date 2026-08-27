/* istanbul ignore file -- route adapter is covered by API contract tests. */
import { readBody } from '../http.mjs';

const allowed = (auth) => auth?.root || auth?.scopes?.includes('metadata:reconcile');

export async function handleReconcileRoute({ method, path, request, response, auth, reconciler }) {
  if (!reconciler || (!path.startsWith('/api/v1/reconcile/') && !path.startsWith('/api/v1/restores/'))) return false;
  if (!allowed(auth)) return false;
  const body = await readBody(request).catch(() => ({}));
  if (method === 'POST' && path === '/api/v1/reconcile/plan') { response.json(200, { ok: true, operation: 'reconcile.plan', data: await reconciler.plan(body.desired ?? body) }); return true; }
  if (method === 'POST' && path === '/api/v1/reconcile/apply') { response.json(200, { ok: true, operation: 'reconcile.apply', data: await reconciler.apply(body.desired ?? {}, body) }); return true; }
  if (method === 'POST' && path === '/api/v1/reconcile/verify') { const data = await reconciler.verify(body.desired ?? body); response.json(data.verified ? 200 : 503, { ok: data.verified, operation: 'reconcile.verify', data }); return true; }
  if (method === 'POST' && path === '/api/v1/restores/metadata/plan') { response.json(200, { ok: true, operation: 'restore.metadata.plan', data: await reconciler.plan(body.desired ?? body) }); return true; }
  if (method === 'POST' && path === '/api/v1/restores/metadata/apply') { response.json(200, { ok: true, operation: 'restore.metadata.apply', data: await reconciler.apply(body.desired ?? {}, body) }); return true; }
  if (method === 'POST' && path === '/api/v1/restores/accounts/plan') { response.json(200, { ok: true, operation: 'restore.accounts.plan', data: await reconciler.plan({ accounts: body.accounts ?? body.desired?.accounts ?? [] }) }); return true; }
  if (method === 'POST' && path === '/api/v1/restores/accounts/apply') { response.json(200, { ok: true, operation: 'restore.accounts.apply', data: await reconciler.apply({ accounts: body.accounts ?? body.desired?.accounts ?? [] }, body) }); return true; }
  if (method === 'POST' && path === '/api/v1/restores/accounts/verify') { const data = await reconciler.verify({ accounts: body.accounts ?? body.desired?.accounts ?? [] }); response.json(data.verified ? 200 : 503, { ok: data.verified, operation: 'restore.accounts.verify', data }); return true; }
  return false;
}
