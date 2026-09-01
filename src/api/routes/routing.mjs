import { readBody } from '../http.mjs';
import { handleRoutingInspection } from './routing-inspection.mjs';

export async function handleRoutingRoute({ method, path, url, request, response, observationStore, routingBundles, routingEvent, auth, getStatus, getActiveIntent, getConfig, environment, identity, fetchImpl } = {}) {
  if (!identity?.name) throw new Error('runtime identity is required for routing routes');
  if (path === '/api/v1/routes' && method === 'GET') return handleRoutingInspection({ url, response, observationStore, routingEvent, getStatus, getActiveIntent, getConfig, environment, identity, fetchImpl });
  if (path === '/api/v1/routes/refresh' && method === 'POST') {
    const bundle = await routingBundles.lease(await readBody(request));
    response.json(200, { ok: true, operation: 'routes.refresh', data: { routes: bundle.routes, bundleVersion: bundle.bundleVersion } });
    return true;
  }
  if (path === '/api/v1/routing/bundle' && method === 'GET') {
    const requestedIdentity = url.searchParams.get('identity');
    const requestedNodeIdentity = requestedIdentity ?? auth?.identity;
    if (!requestedNodeIdentity) throw Object.assign(new Error('identity is required'), { statusCode: 400 });
    if (requestedIdentity && auth?.identity && requestedIdentity !== auth.identity) throw Object.assign(new Error('identity is not authorized for this token'), { statusCode: 403 });
    response.json(200, { ok: true, operation: 'routing.bundle', data: await routingBundles.lease({ identity: requestedNodeIdentity, application: auth?.application, database: auth?.database }) });
    return true;
  }
  return false;
}
