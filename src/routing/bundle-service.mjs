import { createSupervisorBundle as connectionBundleFromConfig } from '../internal/routing/bundle.mjs';
import { calculateRoutes } from './decision.mjs';
import { evaluateQuorum } from '../cluster/quorum.mjs';
import { createAssignmentStore } from './assignment-store.mjs';
import { filterReachableNodes } from './address-validation.mjs';
import { clientSqlAddress } from './client-address.mjs';
import { createQuorumAssignmentCoordinator } from './quorum-assignment.mjs';
import { validateBundle } from '@eliware/elera-lib';

export function createRoutingBundleService({ managed, observationStore, environment = process.env, now = Date.now, assignmentStore = createAssignmentStore({ path: environment.ELERA_ASSIGNMENTS_PATH ?? `${environment.MARIADB_DATA_DIR ?? '/var/lib/mysql'}/elera-state/routing-assignments.json` }), validateAddresses = false, resolveAddress, log = {} } = {}) {
  if (!managed?.lease || !observationStore?.snapshot) throw new TypeError('managed metadata and observation store are required');
  const cache = new Map();
  const assignments = createQuorumAssignmentCoordinator({ assignmentStore, observationStore, environment, now, log });
  return {
    async lease(request) {
      const result = await managed.lease(request);
      const application = result.application ?? request.application;
      const database = result.database ?? request.database;
      const identity = result.identity ?? request.identity;
      if (request.application && result.application && request.application !== result.application) throw Object.assign(new Error('application is not authorized for this token'), { statusCode: 403 });
      const key = result.application ?? request.application ?? 'default'; const current = now(); const cached = cache.get(key); const observations = observationStore.snapshot();
      const quorum = evaluateQuorum(observations, { now: current, expectedSize: Number(environment.ELERA_CLUSTER_SIZE ?? observations.length) });
      const reachable = quorum.quorum ? (validateAddresses ? await filterReachableNodes(observations, { resolve: resolveAddress, log }) : observations) : [];
      const assignedWriter = await assignments.read(key);
      const routes = cached && current - cached.calculatedAt < 1000 ? cached.routes : calculateRoutes({ application: key, observations: reachable, previousWriterHost: assignedWriter ?? cached?.routes.primary?.[0]?.host, now: current });
      if (routes.writer?.host && routes.writer.host !== assignedWriter) await assignments.write(key, routes.writer.host, observations);
      if (!cached || routes !== cached.routes) cache.set(key, { calculatedAt: current, routes });
      const fallback = result.routes;
      const selected = routes.balanced.length ? routes : fallback;
      const address = clientSqlAddress(environment);
      return connectionBundleFromConfig({ ...result, application, database, identity, routes: { primary: selected.primary, balanced: selected.balanced }, writer: selected.writer, failover: selected.failover, readers: selected.readers, bundleVersion: routes.balanced.length ? routes.bundleVersion : (result.bundleVersion ?? 1), nodeIdentity: { name: address, address }, ports: { sql: Number(environment.ELERA_NODE_SQL_PORT ?? 3306), http: Number(environment.ELERA_HTTP_PORT ?? 8080) } });
    },
    async validate(request = {}) {
      let bundle;
      try {
        bundle = await this.lease(request);
      } catch (error) {
        return { valid: false, error: error.message };
      }
      const routes = bundle.routes;
      validateBundle(bundle);
      return { valid: true, application: bundle.application, database: bundle.database, bundleVersion: bundle.bundleVersion, writer: bundle.writer, routeCount: routes.balanced.length };
    },
    async rebalance(request = {}) {
      const key = request.application ?? 'default';
      cache.delete(key);
      const bundle = await this.lease(request);
      return { bundle, recalculated: true };
    },
  };
}
