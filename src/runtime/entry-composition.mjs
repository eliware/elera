import { promises as dns } from 'node:dns';
import { createHealthService } from '../health.mjs';
import { createSupervisorProbes } from './probe-wiring.mjs';
import { createSupervisorControlComposition } from './control-composition.mjs';
import { createSupervisorComposition } from './composition.mjs';
import { isShuttingDown } from './lifecycle-predicates.mjs';
import { createRoutingComposition } from './routing-composition.mjs';
import { createRoutingStream } from '../api/routing-stream.mjs';
import { createSupervisorLifecycle } from './lifecycle-composition.mjs';
import { closeServer } from './server-lifecycle.mjs';
import { createSupervisorTraffic } from './traffic-wiring.mjs';

export function createSupervisorEntryComposition({ config, identity, lifecycle, telemetry, recoveryState, recovery, log, environment = process.env, getDb, setDrained, getDrained, getTimers, getMariaProcess, getColdState = () => ({}), applyIntent = (intent) => intent, servers = [] }) {
  const health = createHealthService({
    db: { query: (...args) => getDb()?.query?.(...args), health: (...args) => getDb()?.health?.(...args) },
    timeoutMs: config.timeoutMs, elera: config.elera, clusterSize: config.clusterSize,
    getTelemetry: () => telemetry.summary(), getRecoveryState: () => recoveryState.snapshot(), log,
  });
  const domain = createSupervisorComposition({ query: (...args) => getDb()?.query?.(...args), log });
  const routing = createRoutingComposition({
    environment: { ...environment, ELERA_EVENT_VERSION_PATH: environment.ELERA_EVENT_VERSION_PATH ?? `${config.dataDir}/elera-state/routing-event-versions.json` },
    config, identity, observationStore: domain.observationStore, managed: domain.managed,
    query: (...args) => getDb()?.query?.(...args), resolveAddress: (host) => dns.lookup(host), log, getDrained,
  });
  const routingStream = createRoutingStream({
    token: environment.ROOT_TOKEN, nodeIdentity: identity,
    authorize: async (supplied, application) => {
      if (!supplied) return false;
      if (environment.ROOT_TOKEN && supplied === environment.ROOT_TOKEN) return true;
      const auth = await domain.managed?.authenticate?.(supplied);
      if (!auth || (application && auth.application && auth.application !== application)) return false;
      return auth;
    }, getEvent: routing.routingEvent, bus: routing.routingBus, telemetry, log,
    loadBalancerEndpoint: environment.ELERA_LOAD_BALANCER_ENDPOINT,
  });
  const traffic = createSupervisorTraffic({ telemetry, identity, config, health, routingBus: routing.routingBus, log, getDb, setDrained });
  const control = createSupervisorControlComposition({
    db: { query: (...args) => getDb()?.query?.(...args) }, ...domain, routingBundles: routing.routingBundles,
    routingEvent: routing.routingEvent, recovery, observationStore: domain.observationStore, health,
    clusterDrain: traffic.clusterDrain, lifecycle, telemetry, config, intentState: domain.intentState,
    coldState: getColdState(), processController: { start: (...args) => getMariaProcess()?.start?.(...args) }, applyIntent, environment, log,
  });
  const probes = createSupervisorProbes({
    getStatus: () => health.status(), isDraining: () => traffic.drain.isDraining(),
    isShuttingDown: () => isShuttingDown(lifecycle.get()),
    controlHandler: (request, response) => control.handler(request, response),
    upgradeHandler: (request, socket, head) => routingStream.upgrade(request, socket, head), log,
  });
  servers.push(probes);
  return { ...domain, ...routing, health, routingStream, traffic, probes, control, lifecycleWiring: ({ errors }) => createSupervisorLifecycle({ lifecycle, sqlQuiesce: traffic.sqlQuiesce, drain: traffic.drain, clusterDrain: traffic.clusterDrain, config, identity, observationStore: domain.observationStore, getTimers, routingBus: routing.routingBus, routingStream, telemetry, servers, closeServer, getMariaProcess, getDb, errors, log }) };
}
