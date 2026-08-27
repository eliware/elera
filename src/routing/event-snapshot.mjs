/* istanbul ignore file -- routing event composition is covered by API and lab contracts. */
import { calculateRoutes } from './decision.mjs';
import { evaluateQuorum } from '../cluster/quorum.mjs';

export function createRoutingEventSnapshot({ observationStore, environment = process.env, now = Date.now } = {}) {
  let version = 0;
  let fingerprint = '';
  let event;
  return function snapshot(application = 'default') {
    const observations = observationStore?.snapshot?.() ?? [];
    const quorum = evaluateQuorum(observations, { now: now(), expectedSize: Number(environment.ELERA_CLUSTER_SIZE ?? observations.length) });
    const routes = calculateRoutes({ application, observations: quorum.quorum ? observations : [], now: now() });
    const nextFingerprint = JSON.stringify({ application, routes });
    if (nextFingerprint !== fingerprint) { fingerprint = nextFingerprint; version += 1; event = { type: 'routing.update', version, bundleVersion: routes.bundleVersion ?? String(version), application, routes, generatedAt: new Date(now()).toISOString() }; }
    return event;
  };
}
