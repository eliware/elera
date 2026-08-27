const policies = new Set(['primary', 'balanced']);

export function validateRoutePolicy(policy = 'auto') {
  if (policy !== 'auto' && !policies.has(policy)) throw Object.assign(new Error('route policy must be auto, primary, or balanced'), { statusCode: 400 });
  return policy;
}

export function validateCredentialLeaseRequest(request) {
  if (!request || typeof request.database !== 'string' || !request.database || typeof request.identity !== 'string' || !request.identity) throw Object.assign(new Error('database and identity are required'), { statusCode: 400 });
  const routes = request.routes ?? ['primary', 'balanced'];
  if (!Array.isArray(routes) || routes.some((route) => !policies.has(route))) throw Object.assign(new Error('routes must contain only primary and balanced'), { statusCode: 400 });
  return { database: request.database, identity: request.identity, routes: [...routes] };
}
