const routes = ['primary', 'balanced'];

export function validateConnectionBundle(bundle) {
  if (!bundle || typeof bundle !== 'object') throw Object.assign(new Error('connection bundle is required'), { statusCode: 400 });
  if (!bundle.database || !bundle.identity) throw Object.assign(new Error('connection bundle database and identity are required'), { statusCode: 400 });
  if (!bundle.expiresAt || Number.isNaN(Date.parse(bundle.expiresAt))) throw Object.assign(new Error('connection bundle expiresAt is required'), { statusCode: 400 });
  for (const route of routes) {
    if (!Array.isArray(bundle.routes?.[route])) throw Object.assign(new Error(`connection bundle route ${route} is required`), { statusCode: 400 });
    for (const node of bundle.routes[route]) {
      if (!node.host || !Number.isInteger(Number(node.port)) || Number(node.port) < 1 || Number(node.port) > 65535) throw Object.assign(new Error(`invalid ${route} route node`), { statusCode: 400 });
      if (node.weight !== undefined && (!Number.isFinite(Number(node.weight)) || Number(node.weight) < 0)) throw Object.assign(new Error(`invalid ${route} route weight`), { statusCode: 400 });
    }
  }
  return bundle;
}

export function connectionBundleFromConfig({ database, identity, username, password, routes: routeSet, expiresAt, refreshAfter, bundleVersion = 1 }) {
  return validateConnectionBundle({ database, identity, credentials: { username, password }, routes: routeSet, expiresAt, refreshAfter, bundleVersion });
}
