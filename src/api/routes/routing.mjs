/* istanbul ignore file -- HTTP adapter is covered by endpoint and lab contract tests. */
import { readBody } from '../http.mjs';
import { calculateRoutes } from '../../routing/decision.mjs';
import { refreshLocalObservation } from '../../routing/local-observation.mjs';

const recentRoutes = new Map();

export async function handleRoutingRoute({ method, path, url, request, response, observationStore, routingBundles, routingEvent, getStatus, environment } = {}) {
  if (path === '/api/v1/routes' && method === 'GET') {
    await refreshLocalObservation({ observationStore, getStatus, environment });
    const application = url.searchParams.get('application') ?? 'default';
    const calculated = calculateRoutes({ application, observations: observationStore?.snapshot?.() ?? [] });
    const previous = recentRoutes.get(application);
    const seeded = routingEvent?.(application)?.routes;
    let routes = calculated.balanced.length ? calculated : previous && Date.now() - previous.at < 5000 ? previous.routes : seeded?.balanced?.length ? seeded : calculated;
    if (!routes.balanced.length) {
      const status = await getStatus?.().catch?.(() => undefined);
      if (status?.ready && environment?.ELERA_NODE_ADDRESS) { const node = { host: environment.ELERA_NODE_ADDRESS, port: Number(environment.ELERA_NODE_SQL_PORT ?? 3306), weight: 100 }; routes = { primary: [node], balanced: [node], bundleVersion: `${application}:local` }; }
    }
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
