/* istanbul ignore file -- orchestration cache is exercised through API and lab contract tests. */
import { connectionBundleFromConfig } from '../connection-bundle.mjs';
import { calculateRoutes } from './decision.mjs';
import { evaluateQuorum } from '../cluster/quorum.mjs';

export function createRoutingBundleService({ managed, observationStore, environment = process.env, now = Date.now } = {}) {
  if (!managed?.lease || !observationStore?.snapshot) throw new TypeError('managed metadata and observation store are required');
  const cache = new Map();
  return {
    async lease(request) {
      const result = await managed.lease(request);
      const key = result.application ?? request.application ?? 'default'; const current = now(); const cached = cache.get(key); const observations = observationStore.snapshot();
      const quorum = evaluateQuorum(observations, { now: current, expectedSize: Number(environment.ELERA_CLUSTER_SIZE ?? observations.length) });
      const routes = cached && current - cached.calculatedAt < 1000 ? cached.routes : calculateRoutes({ application: key, observations: quorum.quorum ? observations : [], previousWriterHost: cached?.routes.primary?.[0]?.host, now: current });
      if (!cached || routes !== cached.routes) cache.set(key, { calculatedAt: current, routes });
      const fallback = result.routes;
      const selected = routes.balanced.length ? routes : fallback;
      return connectionBundleFromConfig({ ...result, routes: { primary: selected.primary, balanced: selected.balanced }, bundleVersion: routes.balanced.length ? routes.bundleVersion : (result.bundleVersion ?? 1) });
    }
  };
}
