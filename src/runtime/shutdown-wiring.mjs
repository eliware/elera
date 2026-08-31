import { registerSignals } from '@eliware/common';
import { createShutdown } from '../lifecycle/shutdown.mjs';
import { shutdownCondition } from '../cluster/shutdown-condition.mjs';

export function createSupervisorShutdown({ lifecycle, sqlQuiesce, drain, clusterDrain, config, identity, observationStore, routingBus, routingStream, telemetry, servers, closeServer, getMariaProcess, getDb, getTimers, errors, log, createShutdownImpl = createShutdown, registerSignalsImpl = registerSignals } = {}) {
  const shutdown = createShutdownImpl({ lifecycle, sqlQuiesce, drain, propagateDrain: () => clusterDrain.set(true), shutdownCondition: () => shutdownCondition({ clusterSize: config.clusterSize, observations: observationStore.snapshot(), localNodeId: identity.name }), getTimers, routingBus, routingStream, telemetry, servers, closeServer, getMariaProcess, getDb, shutdownTimeoutMs: config.shutdownTimeoutMs, errors, log });
  return { shutdown, signals: registerSignalsImpl({ log, shutdownHook: shutdown, exitCode: 0 }) };
}
