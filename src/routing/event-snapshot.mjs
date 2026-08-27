import { calculateRoutes } from './decision.mjs';
import { evaluateQuorum } from '../cluster/quorum.mjs';

export function createRoutingEventSnapshot({ observationStore, environment = process.env, now = Date.now } = {}) {
  let version = 0;
  let fingerprint = '';
  let event;
  let lastHealthy;
  return function snapshot(application = 'default') {
    const observations = observationStore?.snapshot?.() ?? [];
    const quorum = evaluateQuorum(observations, { now: now(), expectedSize: Number(environment.ELERA_CLUSTER_SIZE ?? observations.length) });
    const routes = calculateRoutes({ application, observations: quorum.quorum ? observations : [], now: now() });
    const selectedRoutes = routes.balanced.length ? routes : (lastHealthy?.application === application && now() - lastHealthy.at < 5000 ? lastHealthy.routes : routes);
    if (routes.balanced.length) lastHealthy = { application, routes, at: now() };
    const drainState = observations.filter((item) => item.drain).map((item) => item.nodeId).sort();
    const nextFingerprint = JSON.stringify({ application, routes: selectedRoutes, drainState });
    if (nextFingerprint !== fingerprint) { fingerprint = nextFingerprint; version += 1; event = { type: 'routing.update', version, bundleVersion: selectedRoutes.bundleVersion, application, routes: selectedRoutes, generatedAt: new Date(now()).toISOString() }; }
    return event;
  };
}
