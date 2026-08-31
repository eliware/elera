import { validateBundle } from '@eliware/elera-lib';

const routes = ['primary', 'balanced'];

function invalid(message) {
  return Object.assign(new Error(message), { statusCode: 400 });
}

function requireIntegerPort(value, name) {
  if (!Number.isInteger(value) || value < 1 || value > 65535) throw invalid(`${name} must be an integer TCP port`);
}

export function validateSupervisorBundle(bundle) {
  try { return validateBundle(bundle); }
  catch (error) { throw invalid(error.message); }
}

export function createSupervisorBundle({ application, database, physicalDatabase = database, identity, username, password, routes: routeSet, writer, failover, readers, expiresAt, refreshAfter, bundleVersion = 1, nodeIdentity = { name: 'supervisor' }, ports }) {
  if (!routeSet?.primary || !routeSet?.balanced) throw invalid('connection bundle route primary and balanced are required');
  requireIntegerPort(ports?.sql, 'routing bundle ports.sql');
  requireIntegerPort(ports?.http, 'routing bundle ports.http');
  for (const route of ['primary', 'balanced']) for (const node of routeSet[route]) requireIntegerPort(node.port, `routing bundle ${route} port`);
  const primary = routeSet.primary.map((node) => ({ ...node, nodeId: node.nodeId ?? node.host }));
  const balanced = routeSet.balanced.map((node) => ({ ...node, nodeId: node.nodeId ?? node.host }));
  return validateSupervisorBundle({
    apiVersion: 'v1',
    application: application ?? 'default',
    database,
    ...(physicalDatabase ? { physicalDatabase } : {}),
    identity,
    credentials: { username, password },
    routes: { primary, balanced },
    writer: writer ?? primary[0] ?? null,
    failover: failover ?? primary.slice(1),
    readers: readers ?? balanced,
    expiresAt,
    refreshAfter,
    bundleVersion,
    nodeIdentity: typeof nodeIdentity === 'string' ? nodeIdentity : nodeIdentity.name,
    ports: { sql: ports.sql, http: ports.http },
  });
}
