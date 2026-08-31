import { loadSupervisorStartupConfiguration } from './startup-configuration.mjs';
import { prepareSupervisorRecovery } from './recovery-startup.mjs';
import { createSupervisorStartupServices } from './startup-services.mjs';
import { createSupervisorColdBootstrap } from './cold-bootstrap-wiring.mjs';
import { startSupervisorMariaDb } from './maria-startup.mjs';
import { startSupervisorRuntime } from './runtime-start.mjs';

export async function startSupervisor({ config, identity, log, loadEnvironmentIntent, intentState, routingEnvironment, recoveryState, recoveryAudit, health, environment = process.env, dbEnv, probes, routingEvent, routingBus, sharedRoutingAssignments, observationStore, getDrained, telemetry, state }) {
  telemetry.start();
  await observationStore.initialize?.();
  log.info('Elera supervisor starting', { elera: config.elera, httpPort: config.httpPort });
  const startupConfiguration = await loadSupervisorStartupConfiguration({ intentState, loadEnvironmentIntent, node: identity, routingEnvironment, config });
  const recoveryResult = await prepareSupervisorRecovery({ startupConfiguration, intentState, config, identity, health, recoveryState, recoveryAudit, log, mariaProcess: state.mariaProcess, environment });
  const { initialIntent, args, localEvidence, members, startupDecision } = recoveryResult;
  state.coldRecoveryProtocol = recoveryResult.coldRecoveryProtocol;
  state.recoveryCompletion = recoveryResult.recoveryCompletion;
  state.coldEvidence = localEvidence.local;
  if (config.elera && startupDecision.mode === 'bootstrap' && startupDecision.localWinner === true) recoveryState.set('bootstrapping', { epoch: startupDecision.epoch });
  log.info('Startup recovery decision completed', { mode: startupDecision.mode, winner: startupDecision.winner, epoch: startupDecision.epoch, reason: startupDecision.reason });
  state.coldBootstrapService = createSupervisorColdBootstrap({ members, localEvidence: localEvidence.local, remoteEvidence: localEvidence.remote, bootstrapLocal: () => state.coldBootstrapLocal?.(), config, environment, log });
  const startupServices = createSupervisorStartupServices({ args, config, log, recoveryState, recoveryAudit, isRestarting: () => state.restarting, setRestarting: (value) => { state.restarting = value; }, onFatal: (code) => process.exit(code ?? 1), health, loadIntent: loadEnvironmentIntent, intentState, environment, shuttingDown: () => state.shuttingDown });
  state.mariaProcess = startupServices.processController;
  state.coldBootstrapLocal = startupServices.bootstrapLocal;
  state.applyIntent = startupServices.applyIntent;
  state.bootstrapMaria = startupServices.bootstrapMaria;
  startSupervisorMariaDb({ processController: state.mariaProcess, config, startupDecision, health, recoveryState, recoveryAudit, recoveryCompletion: state.recoveryCompletion, coldRecoveryProtocol: state.coldRecoveryProtocol, startupServer: recoveryResult.startupServer, identity, signals: state.signals, log });
  const runtime = await startSupervisorRuntime({ dbEnv, probes, config, health, log, startupDecision, initialIntent, recoveryState, recoveryAudit, identity, routingEvent, routingBus, sharedRoutingAssignments, observationStore, getDrained, environment });
  state.db = runtime.db;
  state.routingTimer = runtime.routingTimer;
  state.peerTimer = runtime.peerTimer;
  log.info('Elera supervisor started');
}
