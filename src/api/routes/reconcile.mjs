/* istanbul ignore file -- route adapter is covered by API contract tests. */
import { readBody } from '../http.mjs';

const allowed = (auth) => auth?.root || auth?.scopes?.includes('metadata:reconcile');

export async function handleReconcileRoute({ method, path, request, response, auth, reconciler }) {
  if (!reconciler || !path.startsWith('/api/v1/reconcile/')) return false;
  if (!allowed(auth)) return false;
  const body = await readBody(request).catch(() => ({}));
  if (method === 'POST' && path === '/api/v1/reconcile/plan') { response.json(200, { ok: true, operation: 'reconcile.plan', data: await reconciler.plan(body.desired ?? body) }); return true; }
  if (method === 'POST' && path === '/api/v1/reconcile/apply') { response.json(200, { ok: true, operation: 'reconcile.apply', data: await reconciler.apply(body.desired ?? {}, body) }); return true; }
  if (method === 'POST' && path === '/api/v1/reconcile/verify') { const data = await reconciler.verify(body.desired ?? body); response.json(data.verified ? 200 : 503, { ok: data.verified, operation: 'reconcile.verify', data }); return true; }
  return false;
}
