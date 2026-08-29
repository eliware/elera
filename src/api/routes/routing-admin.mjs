import { readBody } from '../http.mjs';

function applicationFrom(url, body = {}, auth = {}) {
  const requested = body.application ?? url?.searchParams?.get('application');
  if (requested && auth.application && requested !== auth.application && !auth.root && !auth.scopes?.includes('*')) {
    throw Object.assign(new Error('application is not authorized for this token'), { statusCode: 403 });
  }
  return requested ?? auth.application ?? 'default';
}

function allowed(auth, scope) {
  return auth?.root || auth?.scopes?.includes('*') || auth?.scopes?.includes(scope);
}

export async function handleRoutingAdminRoute({ method, path, url, request, response, routingBundles, routingEvent, auth } = {}) {
  if (!routingBundles) return false;
  if (method === 'GET' && path === '/api/v1/routing/validate') {
    if (!allowed(auth, 'routing:read')) return false;
    const application = applicationFrom(url, {}, auth);
    response.json(200, { ok: true, operation: 'routing.validate', data: await routingBundles.validate({ application, identity: auth?.identity }) });
    return true;
  }
  if (method === 'GET' && path === '/api/v1/routing/events') {
    if (!allowed(auth, 'routing:read')) return false;
    const application = applicationFrom(url, {}, auth);
    response.json(200, { ok: true, operation: 'routing.events', data: routingEvent?.(application) ?? null });
    return true;
  }
  if (method === 'POST' && path === '/api/v1/routing/rebalance') {
    if (!allowed(auth, 'routing:rebalance')) return false;
    const body = await readBody(request);
    if (body.confirm !== true) throw Object.assign(new Error('routing rebalance requires confirm: true'), { statusCode: 409 });
    const application = applicationFrom(undefined, body, auth);
    const result = await routingBundles.rebalance({ ...body, application, identity: auth?.identity });
    response.json(202, { ok: true, operation: 'routing.rebalance', data: result });
    return true;
  }
  return false;
}
