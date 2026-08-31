import { createSupervisorErrorHandlers } from './error-wiring.mjs';
import { createSupervisorShutdown } from './shutdown-wiring.mjs';

export function createSupervisorLifecycle({ log, lifecycle, sqlQuiesce, drain, clusterDrain, config, identity, observationStore, getTimers, routingBus, routingStream, telemetry, servers, closeServer, getMariaProcess, getDb, restartMarker } = {}) {
  const errors = createSupervisorErrorHandlers({ log });
  return { errors, ...createSupervisorShutdown({ lifecycle, sqlQuiesce, drain, clusterDrain, config, identity, observationStore, getTimers, routingBus, routingStream, telemetry, servers, closeServer, getMariaProcess, getDb, errors, log, restartMarker }) };
}
