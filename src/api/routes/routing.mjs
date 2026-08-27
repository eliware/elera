/* istanbul ignore file -- HTTP adapter is covered by endpoint and lab contract tests. */
import { readBody } from '../http.mjs';
import { calculateRoutes } from '../../routing/decision.mjs';

export async function handleRoutingRoute({ method, path, url, request, response, observationStore, routingBundles } = {}) {
  if (path === '/api/v1/routes' && method === 'GET') {
    const routes = calculateRoutes({ application: url.searchParams.get('application') ?? 'default', observations: observationStore?.snapshot?.() ?? [] });
    response.json(200, { ok: true, operation: 'routes.inspect', data: routes }); return true;
  }
  if (path === '/api/v1/routes/refresh' && method === 'POST') {
    const body = await readBody(request); const bundle = await routingBundles.lease(body);
    response.json(200, { ok: true, operation: 'routes.refresh', data: { routes: bundle.routes, bundleVersion: bundle.bundleVersion } }); return true;
  }
  if (path === '/api/v1/routing/bundle' && method === 'GET') {
    const identity = url.searchParams.get('identity'); if (!identity) throw Object.assign(new Error('identity is required'), { statusCode: 400 });
    response.json(200, { ok: true, operation: 'routing.bundle', data: await routingBundles.lease({ identity }) }); return true;
  }
  return false;
}
