import { calculateRoutes } from '../../routing/decision.mjs';
import { refreshLocalObservation, refreshPeerObservations } from '../../routing/local-observation.mjs';
import { clientSqlAddress } from '../../routing/client-address.mjs';

const recentRoutes = new Map();
const observationsFrom = (store) => !store || typeof store.snapshot !== 'function' ? [] : store.snapshot() ?? [];
const optionalStatus = async (getStatus) => {
  if (typeof getStatus !== 'function') return undefined;
  try { return await getStatus(); } catch { return undefined; }
};

export async function handleRoutingInspection({ url, response, observationStore, routingEvent, getStatus, environment, fetchImpl, clientAddress = clientSqlAddress } = {}) {
  await refreshLocalObservation({ observationStore, getStatus, environment });
  const application = url.searchParams.get('application') ?? 'default';
  const calculated = calculateRoutes({ application, observations: observationsFrom(observationStore) });
  const previous = recentRoutes.get(application);
  const seeded = routingEvent?.(application)?.routes;
  let routes = calculated.balanced.length ? calculated : previous && Date.now() - previous.at < 5000 ? previous.routes : seeded?.balanced?.length ? seeded : calculated;
  if (!routes.balanced.length) {
    await refreshPeerObservations({ observationStore, environment, fetchImpl });
    routes = calculateRoutes({ application, observations: observationsFrom(observationStore) });
  }
  if (!routes.balanced.length) {
    const status = await optionalStatus(getStatus);
    if (status?.ready) {
      const node = { host: clientAddress(environment), port: Number(environment?.ELERA_NODE_SQL_PORT ?? 3306), weight: 100 };
      routes = { primary: [node], balanced: [node], bundleVersion: `${application}:local` };
    }
  }
  if (calculated.balanced.length) recentRoutes.set(application, { routes: calculated, at: Date.now() });
  response.json(200, { ok: true, operation: 'routes.inspect', data: routes });
  return true;
}
