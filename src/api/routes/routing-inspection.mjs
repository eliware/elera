import { calculateRoutes } from '../../routing/decision.mjs';
import { refreshLocalObservation, refreshPeerObservations } from '../../routing/local-observation.mjs';

const recentRoutes = new Map();
const observationsFrom = (store) => !store || typeof store.snapshot !== 'function' ? [] : store.snapshot() ?? [];
const optionalStatus = async (getStatus) => {
  if (typeof getStatus !== 'function') return undefined;
  try { return await getStatus(); } catch { return undefined; }
};

export async function handleRoutingInspection({ url, response, observationStore, routingEvent, getStatus, getActiveIntent, getConfig, environment, identity, fetchImpl } = {}) {
  if (!identity?.name) throw new Error('runtime identity is required for routing inspection');
  await refreshLocalObservation({ observationStore, getStatus, environment, identity });
  const application = url.searchParams.get('application') ?? 'default';
  const routeKey = `${identity.name}:${application}`;
  const calculated = calculateRoutes({ application, observations: observationsFrom(observationStore) });
  const previous = recentRoutes.get(routeKey);
  const seeded = routingEvent?.(application)?.routes;
  let routes = calculated.balanced.length ? calculated : previous && Date.now() - previous.at < 5000 ? previous.routes : seeded?.balanced?.length ? seeded : calculated;
  if (!routes.balanced.length) {
    const intent = await getActiveIntent?.();
    await refreshPeerObservations({ observationStore, members: intent?.cluster?.members ?? [], identity, httpPort: getConfig?.().httpPort ?? 8080, environment, fetchImpl });
    routes = calculateRoutes({ application, observations: observationsFrom(observationStore) });
  }
  if (!routes.balanced.length) {
    const status = await optionalStatus(getStatus);
    if (status?.ready && identity?.name) {
      const node = { host: identity.name, port: Number(environment?.ELERA_NODE_SQL_PORT ?? 3306), weight: 100 };
      routes = { primary: [node], balanced: [node], bundleVersion: `${application}:local` };
    }
  }
  if (calculated.balanced.length) recentRoutes.set(routeKey, { routes: calculated, at: Date.now() });
  response.json(200, { ok: true, operation: 'routes.inspect', data: routes });
  return true;
}
