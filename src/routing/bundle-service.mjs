import { connectionBundleFromConfig } from '../connection-bundle.mjs';
import { calculateRoutes } from './decision.mjs';

export function createRoutingBundleService({ managed, observationStore, environment = process.env, now = Date.now } = {}) {
  if (!managed?.lease || !observationStore?.snapshot) throw new TypeError('managed metadata and observation store are required');
  return {
    async lease(request) {
      const result = await managed.lease(request);
      const routes = calculateRoutes({ application: result.application, observations: observationStore.snapshot(), now: now() });
      const fallback = result.routes;
      return connectionBundleFromConfig({ ...result, routes: routes.balanced.length ? routes : fallback });
    }
  };
}
