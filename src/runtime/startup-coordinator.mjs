import { loadSupervisorStartupConfiguration } from './startup-configuration.mjs';
import { prepareSupervisorRecovery } from './recovery-startup.mjs';
import { createSupervisorStartupServices } from './startup-services.mjs';
import { createSupervisorColdBootstrap } from './cold-bootstrap-wiring.mjs';
import { startSupervisorMariaDb } from './maria-startup.mjs';
import { startSupervisorRuntime } from './runtime-start.mjs';
import { startPendingInitRuntime } from '../lifecycle/pending-init/runtime.mjs';
import { inspectDataDirectory } from '../lifecycle/data-directory.mjs';
import { startAuthorizedRecoveryProcess } from './recovery-process-start.mjs';
import { startAuthorizedRecoveryJoin } from './recovery-join-start.mjs';

export async function startSupervisor({ config, identity, log, loadEnvironmentIntent, intentState, routingEnvironment, recoveryState, recoveryAudit, health, environment = process.env, dbEnv, probes, routingEvent, routingBus, sharedRoutingAssignments, observationStore, getDrained, recoverTraffic = async () => {}, cleanRestartIntent, telemetry, state, startPendingRuntime = startPendingInitRuntime, onRecoveryBootstrap = async () => {}, onRecoveryComplete = async () => {}, recoverJoiners = async () => {} }) {
  log.debug?.('Startup phase: telemetry and observation initialization');
  telemetry.start();
  await observationStore.initialize?.();
  log.info('Elera supervisor starting', { elera: config.elera, httpPort: config.httpPort });
  const startupConfiguration = await loadSupervisorStartupConfiguration({ intentState, loadEnvironmentIntent, node: identity, routingEnvironment, config });
  if (probes.start) await probes.start(config.httpPort, '0.0.0.0', () => log.info('HTTP listener started', { port: config.httpPort }));
  log.debug?.('Startup phase: recovery preparation complete', { node: identity.name, clusterSize: config.clusterSize });
  const recoveryResult = await prepareSupervisorRecovery({ startupConfiguration, intentState, config, identity, health, recoveryState, recoveryAudit, log, mariaProcess: state.mariaProcess, environment, restartMarker: cleanRestartIntent, probes });
  const { initialIntent, args, localEvidence, members, startupDecision, startupServer } = recoveryResult;
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
  if (startupDecision.mode === 'blocked') {
    log.debug?.('Recovery phase: entering pending control runtime', { reason: startupDecision.reason });
    const initializedData = inspectDataDirectory(config.dataDir).action === 'start';
    let pendingRuntime;
    let temporaryListenersClosed = false;
    const closeTemporaryListeners = async () => {
      if (temporaryListenersClosed) return;
      temporaryListenersClosed = true;
      pendingRuntime?.shutdown?.();
      await startupServer?.close?.();
    };
    const startRecoveryRuntime = async (startupDecision) => {
      const runtime = await startSupervisorRuntime({ dbEnv, probes, config, health, log, startupDecision, initialIntent, recoveryState, recoveryAudit, identity, routingEvent, routingBus, sharedRoutingAssignments, observationStore, getDrained, environment, setDb: (db) => { state.db = db; } });
      state.routingTimer = runtime.routingTimer;
      state.peerTimer = runtime.peerTimer;
      return runtime;
    };
    const startAuthorizedRecovery = async (bootstrap) => {
      log.debug?.('Recovery phase: authorized bootstrap handoff requested', { bootstrap });
      const localWinner = await startAuthorizedRecoveryProcess({ bootstrap, identity, args, mariaProcess: state.mariaProcess, recoveryState, onRecoveryBootstrap });
      if (!localWinner) return false;
      await closeTemporaryListeners();
      log.debug?.('Recovery phase: temporary listeners closed; starting winner runtime', { epoch: bootstrap?.epoch });
      const runtime = await startRecoveryRuntime({ mode: 'bootstrap', localWinner: true, epoch: bootstrap?.epoch, recoveryEpoch: { clusterId: bootstrap?.clusterId, quorum: bootstrap?.quorum ?? members.map((member) => member.name) } });
      await recoverJoiners({ bootstrap, members, runtime });
      log.debug?.('Recovery phase: sequential joiners completed', { epoch: bootstrap?.epoch });
      return onRecoveryBootstrap(bootstrap);
    };
    const onRecoveryJoin = (request) => startAuthorizedRecoveryJoin({ request, identity, args, mariaProcess: state.mariaProcess, recoveryState, recoveryAudit, startRuntime: (options) => startRecoveryRuntime(options.startupDecision), runtimeOptions: {} });
    pendingRuntime = await startPendingRuntime({ environment, logger: log, recoveryRequired: initializedData, recoveryReason: startupDecision.reason, recoveryProtocol: state.coldRecoveryProtocol, onRecoveryBootstrap: startAuthorizedRecovery, onRecoveryComplete, onRecoveryJoin });
    log.warn('Supervisor startup is blocked; pending recovery listener is active', { httpPort: config.httpPort, reason: startupDecision.reason });
    return { pending: true };
  }
  startSupervisorMariaDb({ processController: state.mariaProcess, config, startupDecision, health, recoveryState, recoveryAudit, recoveryCompletion: state.recoveryCompletion, coldRecoveryProtocol: state.coldRecoveryProtocol, startupServer: recoveryResult.startupServer, identity, signals: state.signals, log });
  const runtime = await startSupervisorRuntime({ dbEnv, probes, config, health, log, startupDecision, initialIntent, recoveryState, recoveryAudit, identity, routingEvent, routingBus, sharedRoutingAssignments, observationStore, getDrained, environment, setDb: (db) => { state.db = db; } });
  await recoverTraffic();
  state.db = runtime.db;
  state.routingTimer = runtime.routingTimer;
  state.peerTimer = runtime.peerTimer;
  log.info('Elera supervisor started');
}
