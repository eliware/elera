import { calculateRoutes } from './decision.mjs';
import { evaluateQuorum } from '../cluster/quorum.mjs';
import { createEventVersionStore } from './event-version-store.mjs';

const isFqdn = (value) => typeof value === 'string' && value.length <= 253 && value.includes('.') && !value.endsWith('.') && /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/i.test(value);

export function createRoutingEventSnapshot({ observationStore, assignmentStore, environment = process.env, nodeIdentity, now = Date.now, getDrained = () => false, versionStore = createEventVersionStore({ path: environment.ELERA_EVENT_VERSION_PATH }) } = {}) {
  if (!observationStore?.snapshot) throw new TypeError('observation store is required for routing events');
  if (!isFqdn(nodeIdentity?.name)) throw new TypeError('runtime routing event identity must be a fully qualified hostname');
  const versions = new Map();
  const fingerprints = new Map();
  const events = new Map();
  const lastHealthy = new Map();
  return function snapshot(application = 'default') {
    const localNode = nodeIdentity.name;
    const observations = observationStore.snapshot().map((item) => {
      if (!isFqdn(item?.nodeId) || !isFqdn(item?.address)) throw new Error('routing observations must use FQDN node identities and addresses');
      return item.nodeId === localNode ? { ...item, drain: getDrained() } : item;
    });
    const timestamp = now();
    const quorum = evaluateQuorum(observations, { now: timestamp, expectedSize: Number(environment.ELERA_CLUSTER_SIZE ?? observations.length) });
    const routes = calculateRoutes({ application, observations: quorum.quorum ? observations : [], previousWriterHost: assignmentStore?.peek?.(application), now: timestamp });
    const healthy = lastHealthy.get(application);
    const selectedRoutes = routes.balanced.length ? routes : (healthy && timestamp - healthy.at < 5000 ? healthy.routes : routes);
    if (routes.balanced.length) lastHealthy.set(application, { routes, at: timestamp });
    if (routes.writer?.host && routes.writer.host !== assignmentStore?.peek?.(application)) Promise.resolve(assignmentStore?.set?.(application, routes.writer.host, routes.bundleVersion)).catch(() => {});
    const drainState = observations.filter((item) => item.drain).map((item) => item.nodeId).sort();
    const nextFingerprint = JSON.stringify({ application, routes: selectedRoutes, drainState });
    if (nextFingerprint !== fingerprints.get(application)) { fingerprints.set(application, nextFingerprint); const version = versionStore.next(application); versions.set(application, version); events.set(application, { type: 'routing.topology', version, generatedAt: new Date(timestamp).toISOString(), node: localNode, context: { nodeIdentity, ports: { sql: Number(environment.ELERA_NODE_SQL_PORT ?? 3306), http: Number(environment.ELERA_HTTP_PORT ?? 8080) }, clusterCondition: quorum.quorum ? 'Primary' : 'Non-Primary', refreshAfter: new Date(timestamp + 30000).toISOString() }, topology: { nodes: observations.map((item) => ({ nodeId: item.nodeId, address: item.address, sqlPort: Number(item.sqlPort ?? environment.ELERA_NODE_SQL_PORT ?? 3306), state: item.health === 'ok' ? 'ready' : 'unready', draining: Boolean(item.drain) })) } }); }
    return events.get(application);
  };
}
