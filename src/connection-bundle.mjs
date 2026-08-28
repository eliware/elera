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

export function connectionBundleFromConfig({ application, database, identity, username, password, routes: routeSet, writer, failover, readers, expiresAt, refreshAfter, bundleVersion = 1, nodeIdentity, ports }) {
  if (!routeSet?.primary || !routeSet?.balanced) throw Object.assign(new Error('connection bundle route primary and balanced are required'), { statusCode: 400 });
  const primary = routeSet.primary.map((node) => ({ ...node, nodeId: node.nodeId ?? node.host }));
  const balanced = routeSet.balanced.map((node) => ({ ...node, nodeId: node.nodeId ?? node.host }));
  return validateConnectionBundle({ application: application ?? 'default', database, identity, credentials: { username, password }, routes: { primary, balanced }, writer: writer ?? primary[0] ?? null, failover: failover ?? primary.slice(1), readers: readers ?? balanced, expiresAt, refreshAfter, bundleVersion, nodeIdentity, ports });
}
