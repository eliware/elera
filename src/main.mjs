#!/usr/bin/env node
import { log } from '@eliware/common';
import { loadSupervisorConfig } from './config.mjs';
import { loadIntent } from './intent/model.mjs';
import { runtimeIdentity } from './runtime/identity.mjs';
import { supervisorDbEnvironment } from './runtime/db-environment.mjs';
import { createRuntimeState } from './runtime/runtime-state.mjs';
import { createSupervisorEntryComposition } from './runtime/entry-composition.mjs';
import { startSupervisor } from './runtime/startup-coordinator.mjs';
import { createCleanRestartMarker } from './runtime/clean-restart-marker.mjs';
import { createSupervisorRecoveryJoiner } from './runtime/recovery-join-wiring.mjs';

const config = loadSupervisorConfig();
const identity = runtimeIdentity();
const dbEnv = supervisorDbEnvironment();
const state = { db: undefined, drained: false, shuttingDown: false, restarting: false, bootstrapMaria: undefined, coldBootstrapLocal: undefined, coldBootstrapService: undefined, coldEvidence: undefined, coldRecoveryProtocol: undefined, peerTimer: undefined, routingTimer: undefined, mariaProcess: undefined, recoveryCompletion: undefined, applyIntent: undefined, signals: undefined };
let signals;
const servers = [];
const { lifecycle, telemetry, recoveryState, recovery, recoveryAudit } = createRuntimeState({ config, log });
const restartStateDir = process.env.ELERA_CONFIG_STATE_DIR ?? `${config.dataDir}/elera-state`;
const restartMarker = createCleanRestartMarker({ path: `${restartStateDir}/clean-restart.json`, node: identity.name, epoch: null });

let composition;
composition = createSupervisorEntryComposition({
  config, identity, lifecycle, telemetry, recoveryState, recovery, log, restartMarker,
  getDb: () => state.db, setDrained: (value) => { state.drained = value; }, getDrained: () => state.drained,
  getTimers: () => [state.peerTimer, state.routingTimer], getMariaProcess: () => state.mariaProcess,
  getColdState: () => ({
    drain: { isDraining: () => composition.traffic.drain.isDraining(), active: () => composition.traffic.drain.active() },
    clusterDrain: { set: (...args) => composition.traffic.clusterDrain.set(...args) },
    bootstrapMaria: () => state.bootstrapMaria, coldBootstrapService: () => state.coldBootstrapService,
    coldEvidence: () => state.coldEvidence, coldRecoveryProtocol: () => state.coldRecoveryProtocol,
    coldBootstrapLocal: () => state.coldBootstrapLocal,
  }),
  applyIntent: (intent) => state.applyIntent(intent), servers,
});
const { intentState, observationStore, routingEnvironment, sharedRoutingAssignments, routingEvent, routingBus, traffic } = composition;
state.applyIntent = (intent) => intentState.apply(intent);
let errors;
({ errors, signals } = composition.lifecycleWiring({ errors }));
state.signals = signals;

async function main() {
  const recoverJoiners = createSupervisorRecoveryJoiner({ identity, token: process.env.ELERA_PEER_TOKEN ?? process.env.ROOT_TOKEN, timeoutMs: config.startupTimeoutMs, httpPort: config.httpPort, recoveryState, recoveryAudit, publishRecovery: composition.traffic.recover, log });
  await startSupervisor({ config, identity, log, loadEnvironmentIntent: loadIntent, intentState, routingEnvironment, recoveryState, recoveryAudit, health: composition.health, environment: process.env, dbEnv, probes: composition.probes, routingEvent, routingBus, sharedRoutingAssignments, observationStore, getDrained: composition.traffic.getDrained, recoverTraffic: composition.traffic.recover, cleanRestartIntent: restartMarker, telemetry, state, recoverJoiners });
}

main().catch((error) => {
  log.error('Supervisor startup failed', { error });
  void signals.shutdown('startup-failure').then(() => process.exit(1));
});
