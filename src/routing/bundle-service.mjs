import { createSupervisorBundle as connectionBundleFromConfig } from '../internal/routing/bundle.mjs';
import { calculateRoutes } from './decision.mjs';
import { evaluateQuorum } from '../cluster/quorum.mjs';
import { createAssignmentStore } from './assignment-store.mjs';
import { filterReachableNodes } from './address-validation.mjs';
import { createQuorumAssignmentCoordinator } from './quorum-assignment.mjs';
import { validateBundle } from '@eliware/elera-lib';

const isFqdn = (value) => typeof value === 'string' && value.length <= 253 && value.includes('.') && /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/i.test(value);
const validateRoutes = (routes) => {
  for (const kind of ['primary', 'balanced']) for (const route of routes[kind] ?? []) {
    if (!isFqdn(route.host) || !isFqdn(route.nodeId)) throw Object.assign(new Error(`routing ${kind} contains a non-FQDN node identity`), { statusCode: 503 });
  }
  return routes;
};

export function createRoutingBundleService({ managed, observationStore, identity, environment = process.env, now = Date.now, assignmentStore = createAssignmentStore({ path: environment.ELERA_ASSIGNMENTS_PATH ?? `${environment.MARIADB_DATA_DIR ?? '/var/lib/mysql'}/elera-state/routing-assignments.json` }), validateAddresses = false, resolveAddress, log = {} } = {}) {
  if (!managed?.lease || !observationStore?.snapshot) throw new TypeError('managed metadata and observation store are required');
  if (!identity?.name) throw new TypeError('runtime identity is required for routing bundles');
  const cache = new Map();
  const assignments = createQuorumAssignmentCoordinator({ assignmentStore, observationStore, environment, now, log });
  return {
    async lease(request) {
      const result = await managed.lease(request);
      const application = result.application ?? request.application;
      const database = result.database ?? request.database;
      const credentialIdentity = result.identity ?? request.identity;
      if (request.application && result.application && request.application !== result.application) throw Object.assign(new Error('application is not authorized for this token'), { statusCode: 403 });
      if (result.nodeIdentity && result.nodeIdentity !== identity.name) throw Object.assign(new Error('lease response identity does not match runtime identity'), { statusCode: 409 });
      const key = result.application ?? request.application ?? 'default'; const current = now(); const cached = cache.get(key); const observations = observationStore.snapshot();
      const quorum = evaluateQuorum(observations, { now: current, expectedSize: Number(environment.ELERA_CLUSTER_SIZE ?? observations.length) });
      const reachable = quorum.quorum ? (validateAddresses ? await filterReachableNodes(observations, { resolve: resolveAddress, log }) : observations) : [];
      const assignedWriter = await assignments.read(key);
      const routes = cached && current - cached.calculatedAt < 1000 ? cached.routes : calculateRoutes({ application: key, observations: reachable, previousWriterHost: assignedWriter ?? cached?.routes.primary?.[0]?.host, now: current });
      if (routes.writer?.host && routes.writer.host !== assignedWriter) await assignments.write(key, routes.writer.host, observations);
      if (!cached || routes !== cached.routes) cache.set(key, { calculatedAt: current, routes });
      const fallback = result.routes;
      const selected = routes.balanced.length ? routes : fallback;
      validateRoutes(selected);
      return connectionBundleFromConfig({ ...result, application, database, identity: credentialIdentity, routes: { primary: selected.primary, balanced: selected.balanced }, writer: selected.writer, failover: selected.failover, readers: selected.readers, bundleVersion: routes.balanced.length ? routes.bundleVersion : (result.bundleVersion ?? 1), nodeIdentity: { name: identity.name, address: identity.name }, ports: { sql: Number(environment.ELERA_NODE_SQL_PORT ?? 3306), http: Number(environment.ELERA_HTTP_PORT ?? 8080) } });
    },
    async validate(request = {}) {
      let bundle;
      try {
        bundle = await this.lease(request);
      } catch (error) {
        return { valid: false, error: error.message };
      }
      const routes = bundle.routes;
      const normalized = validateBundle(bundle);
      return { valid: true, application: normalized.application, database: normalized.database, bundleVersion: normalized.bundleVersion, writer: normalized.writer, routeCount: normalized.routes.balanced.length };
    },
    async rebalance(request = {}) {
      const key = request.application ?? 'default';
      cache.delete(key);
      const bundle = await this.lease(request);
      return { bundle, recalculated: true };
    },
  };
}
