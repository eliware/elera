/* istanbul ignore file -- HTTP adapter is covered by endpoint and lab contract tests. */
import { readBody } from '../http.mjs';
import { calculateRoutes } from '../../routing/decision.mjs';

const recentRoutes = new Map();

export async function handleRoutingRoute({ method, path, url, request, response, observationStore, routingBundles } = {}) {
  if (path === '/api/v1/routes' && method === 'GET') {
    const application = url.searchParams.get('application') ?? 'default';
    const calculated = calculateRoutes({ application, observations: observationStore?.snapshot?.() ?? [] });
    const previous = recentRoutes.get(application);
    const routes = calculated.balanced.length ? calculated : previous && Date.now() - previous.at < 5000 ? previous.routes : calculated;
    if (calculated.balanced.length) recentRoutes.set(application, { routes: calculated, at: Date.now() });
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
