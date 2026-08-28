import { calculateRoutes } from './decision.mjs';
import { evaluateQuorum } from '../cluster/quorum.mjs';
import { clientSqlAddress } from './client-address.mjs';

export function createRoutingEventSnapshot({ observationStore, assignmentStore, environment = process.env, nodeIdentity, now = Date.now, getDrained = () => false } = {}) {
  const versions = new Map();
  const fingerprints = new Map();
  const events = new Map();
  const lastHealthy = new Map();
  return function snapshot(application = 'default') {
    const localNode = nodeIdentity?.name ?? environment.RUNTIME_NODE_NAME ?? 'elera';
    const observations = (observationStore?.snapshot?.() ?? []).map((item) => item.nodeId === localNode ? { ...item, drain: getDrained() } : item);
    const quorum = evaluateQuorum(observations, { now: now(), expectedSize: Number(environment.ELERA_CLUSTER_SIZE ?? observations.length) });
    const routes = calculateRoutes({ application, observations: quorum.quorum ? observations : [], previousWriterHost: assignmentStore?.peek?.(application), now: now() });
    const healthy = lastHealthy.get(application);
    const selectedRoutes = routes.balanced.length ? routes : (healthy && now() - healthy.at < 5000 ? healthy.routes : routes);
    if (routes.balanced.length) lastHealthy.set(application, { routes, at: now() });
    if (routes.writer?.host && routes.writer.host !== assignmentStore?.peek?.(application)) Promise.resolve(assignmentStore?.set?.(application, routes.writer.host, routes.bundleVersion)).catch(() => {});
    const drainState = observations.filter((item) => item.drain).map((item) => item.nodeId).sort();
    const nextFingerprint = JSON.stringify({ application, routes: selectedRoutes, drainState });
    if (nextFingerprint !== fingerprints.get(application)) { fingerprints.set(application, nextFingerprint); const version = (versions.get(application) ?? 0) + 1; versions.set(application, version); const address = clientSqlAddress(environment); events.set(application, { type: 'routing.update', version, bundleVersion: selectedRoutes.bundleVersion, application, nodeIdentity: { name: address, address }, ports: { sql: Number(environment.ELERA_NODE_SQL_PORT ?? 3306), http: Number(environment.ELERA_HTTP_PORT ?? 8080) }, routes: selectedRoutes, generatedAt: new Date(now()).toISOString() }); }
    return events.get(application);
  };
}
