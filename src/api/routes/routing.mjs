import { readBody } from "../http.mjs";
import { calculateRoutes } from "../../routing/decision.mjs";
import {
  refreshLocalObservation,
  refreshPeerObservations,
} from "../../routing/local-observation.mjs";
import { clientSqlAddress } from '../../routing/client-address.mjs';

const recentRoutes = new Map();

function observationsFrom(store) {
  if (!store || typeof store.snapshot !== "function") return [];
  return store.snapshot() ?? [];
}

async function optionalStatus(getStatus) {
  if (typeof getStatus !== "function") return undefined;
  try {
    return await getStatus();
  } catch {
    return undefined;
  }
}

function localPort(environment) {
  return Number(environment?.ELERA_NODE_SQL_PORT ?? 3306);
}

export async function handleRoutingRoute({
  method,
  path,
  url,
  request,
  response,
  observationStore,
  routingBundles,
  routingEvent,
  auth,
  getStatus,
  environment,
  fetchImpl,
  clientAddress = clientSqlAddress,
} = {}) {
  if (path === "/api/v1/routes" && method === "GET") {
    await refreshLocalObservation({ observationStore, getStatus, environment });
    const application = url.searchParams.get("application") ?? "default";
    const calculated = calculateRoutes({
      application,
      observations: observationsFrom(observationStore),
    });
    const previous = recentRoutes.get(application);
    const seeded = routingEvent?.(application)?.routes;
    let routes = calculated.balanced.length
      ? calculated
      : previous && Date.now() - previous.at < 5000
        ? previous.routes
        : seeded?.balanced?.length
          ? seeded
          : calculated;
    if (!routes.balanced.length) {
      await refreshPeerObservations({
        observationStore,
        environment,
        fetchImpl,
      });
      const refreshed = calculateRoutes({
        application,
        observations: observationsFrom(observationStore),
      });
      routes = refreshed;
    }
    if (!routes.balanced.length) {
      const status = await optionalStatus(getStatus);
      if (status?.ready) {
        const node = {
          host: clientAddress(environment),
          port: localPort(environment),
          weight: 100,
        };
        routes = {
          primary: [node],
          balanced: [node],
          bundleVersion: `${application}:local`,
        };
      }
    }
    if (calculated.balanced.length)
      recentRoutes.set(application, { routes: calculated, at: Date.now() });
    response.json(200, { ok: true, operation: "routes.inspect", data: routes });
    return true;
  }
  if (path === "/api/v1/routes/refresh" && method === "POST") {
    const body = await readBody(request);
    const bundle = await routingBundles.lease(body);
    response.json(200, {
      ok: true,
      operation: "routes.refresh",
      data: { routes: bundle.routes, bundleVersion: bundle.bundleVersion },
    });
    return true;
  }
  if (path === "/api/v1/routing/bundle" && method === "GET") {
    const requestedIdentity = url.searchParams.get("identity");
    const identity = requestedIdentity ?? auth?.identity;
    if (!identity)
      throw Object.assign(new Error("identity is required"), {
        statusCode: 400,
      });
    if (requestedIdentity && auth?.identity && requestedIdentity !== auth.identity)
      throw Object.assign(new Error("identity is not authorized for this token"), {
        statusCode: 403,
      });
    response.json(200, {
      ok: true,
      operation: "routing.bundle",
      data: await routingBundles.lease({ identity, application: auth?.application }),
    });
    return true;
  }
  return false;
}
