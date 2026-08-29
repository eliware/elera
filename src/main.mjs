#!/usr/bin/env node
import { log, registerHandlers, registerSignals } from "@eliware/common";
import { loadSupervisorConfig, mariaDbArguments } from "./config.mjs";
import { createHealthService } from "./health.mjs";
import { createProbeServer } from "./probes.mjs";
import { createControlApi } from "./control-api.mjs";
import { createMariaDbProcess } from "./lifecycle/mariadb-process.mjs";
import { createEleraBootstrap, waitForSql } from "./lifecycle/startup.mjs";
import { createBootstrapCredentialLease } from "./bootstrap/lease.mjs";
import { createMetadataService } from "./metadata/service.mjs";
import { createManagedMetadata } from "./metadata/managed.mjs";
import { createApplicationService } from "./metadata/applications.mjs";
import { createMetadataReconciler } from "./metadata/reconcile.mjs";
import { createArtifactStore } from "./metadata/artifacts.mjs";
import { createManagedAccounts } from "./accounts/managed.mjs";
import { createLifecycleManager } from "./cluster/lifecycle.mjs";
import { createObservationStore } from "./cluster/observation-store.mjs";
import { createDurableObservationStore } from "./cluster/durable-observation-store.mjs";
import { createPeerObservationClient } from "./cluster/peer-observations.mjs";
import { createClusterOperations } from "./cluster/sql-operations.mjs";
import { loadIntent } from "./intent/model.mjs";
import { createIntentState } from "./intent/state.mjs";
import { planIntent } from "./intent/model.mjs";
import { createRoutingBundleService } from "./routing/bundle-service.mjs";
import { createRoutingEventBus } from "./routing/event-bus.mjs";
import { createRoutingEventSnapshot } from "./routing/event-snapshot.mjs";
import { clientSqlAddress } from "./routing/client-address.mjs";
import { createRoutingStream } from "./api/routing-stream.mjs";
import { createAssignmentStore } from "./routing/assignment-store.mjs";
import { createMetadataAssignmentStore } from "./routing/metadata-assignments.mjs";
import { createTelemetryCollector } from "./telemetry/collector.mjs";
import { promises as dns } from "node:dns";
import { createDrainManager } from "./lifecycle/drain-manager.mjs";
import { createSqlQuiesce } from "./lifecycle/sql-quiesce.mjs";
import { createSqlDrainIntegration } from "./lifecycle/sql-routing.mjs";
import { createDrainPropagation } from "./cluster/drain-propagation.mjs";
import { createLifecycleState } from "./lifecycle/state.mjs";
import { createShutdown } from "./lifecycle/shutdown.mjs";
import { createDrainEventPublisher } from "./lifecycle/drain-events.mjs";
import { runtimeIdentity } from "./runtime/identity.mjs";
import { createColdBootstrapEvidence } from "./cluster/cold-bootstrap/peer-evidence.mjs";
import { createColdBootstrapCoordinator } from "./cluster/cold-bootstrap/coordinator.mjs";
import { createColdBootstrapAction } from "./cluster/cold-bootstrap/action.mjs";
import { createSupervisorSqlClient } from "./internal/sql/client.mjs";
import { shutdownCondition } from "./cluster/shutdown-condition.mjs";
import { createStartupEvidenceServer } from "./cluster/cold-bootstrap/startup-evidence-server.mjs";
import { createStartupLocalEvidence } from "./cluster/cold-bootstrap/startup-local-evidence.mjs";
import { inspectDataDirectory } from "./lifecycle/data-directory.mjs";
import { createRecoveryDecisionStore } from "./cluster/cold-bootstrap/decision-store.mjs";
import { createRecoveryLease } from "./cluster/cold-bootstrap/lease.mjs";
import { readStateFile } from "./cluster/cold-bootstrap/state-file.mjs";
import { spawn } from "node:child_process";
import { createRecoveryState } from "./cluster/cold-bootstrap/recovery-state.mjs";
import { createRecoveryControl } from "./recovery/control.mjs";
import { createRecoveryAudit } from "./cluster/cold-bootstrap/audit.mjs";
import { createBootstrapWatch } from "./cluster/cold-bootstrap/bootstrap-watch.mjs";
import { startupArguments } from "./cluster/cold-bootstrap/startup-arguments.mjs";
import { shouldStartMariaDb } from "./cluster/cold-bootstrap/startup-state.mjs";
import { createRecoveryCompletion, waitForRecoveryCompletion } from "./cluster/cold-bootstrap/completion.mjs";
import { verifyJoinedMember } from "./cluster/cold-bootstrap/join-verification.mjs";
import { explicitStartupDecision } from "./cluster/cold-bootstrap/explicit-startup.mjs";
import { promoteSafeToBootstrap } from "./cluster/cold-bootstrap/promote-state.mjs";
import { createColdRecoveryProtocol } from "./cluster/cold-bootstrap/protocol.mjs";

const config = loadSupervisorConfig();
const identity = runtimeIdentity();
// Supervisor control-plane SQL uses the bootstrap root credential; application credentials
// are leased separately and must never be used for provisioning or reconciliation.
const dbEnv = {
  ...process.env,
  MYSQL_HOST: "127.0.0.1",
  MYSQL_PORT: "3306",
  MYSQL_SOCKET: "/run/mysqld/mysqld.sock",
  MYSQL_USER: "root",
  MYSQL_PASSWORD: "",
  MYSQL_DATABASE: "elera_meta",
};
let db;
let drained = false;
let shuttingDown = false;
let restarting = false;
const lifecycle = createLifecycleState({ initial: "serving", onChange: (state) => { telemetry.recordEvent(`lifecycle.${state}`); log.info("Supervisor lifecycle changed", { state }); } });
const telemetry = createTelemetryCollector();
const recoveryState = createRecoveryState(config.elera ? 'pending' : 'joining');
const recovery = createRecoveryControl({ state: recoveryState, log });
const recoveryAudit = createRecoveryAudit(log);
let bootstrapMaria;
let coldBootstrapLocal;
let coldBootstrapService;
let coldEvidence;
let coldRecoveryProtocol;
let peerTimer;
let routingTimer;
let applyIntent = (intent) => intentState.apply(intent);
const servers = [];
const errors = registerHandlers({
  log,
  events: ["uncaughtException", "unhandledRejection", "warning"],
});
const health = createHealthService({
  db: {
    query: (...args) => db.query(...args),
    health: (...args) => db.health(...args),
  },
  timeoutMs: config.timeoutMs,
  elera: config.elera,
  clusterSize: config.clusterSize,
  getTelemetry: () => telemetry.summary(),
  getRecoveryState: () => recoveryState.snapshot(),
  log,
});
const intentState = createIntentState({
  stateDir: process.env.ELERA_CONFIG_STATE_DIR ?? `${process.env.MARIADB_DATA_DIR ?? "/var/lib/mysql"}/elera-state`,
});
const memoryObservationStore = createObservationStore();
const observationStore = process.env.ELERA_OBSERVATION_STATE_PATH
  ? createDurableObservationStore({
      store: memoryObservationStore,
      statePath: process.env.ELERA_OBSERVATION_STATE_PATH,
      log,
    })
  : memoryObservationStore;
const metadata = createMetadataService({
  query: (...args) => db.query(...args),
});
const managed = createManagedMetadata({
  query: (...args) => db.query(...args),
  credentialKey: process.env.ELERA_CREDENTIAL_KEY,
});
const applications = createApplicationService({
  query: (...args) => db.query(...args),
});
const managedAccounts = createManagedAccounts({
  query: (...args) => db.query(...args),
});
const reconciler = createMetadataReconciler({
  managed,
  accounts: managedAccounts,
});
const artifactStore = createArtifactStore({
  query: (...args) => db?.query?.(...args),
});
const routingAssignments = createAssignmentStore({ path: process.env.ELERA_ASSIGNMENTS_PATH ?? `${process.env.MARIADB_DATA_DIR ?? '/var/lib/mysql'}/elera-state/routing-assignments.json` });
const sharedRoutingAssignments = createMetadataAssignmentStore({ query: (...args) => db?.query?.(...args) });
const routingEnvironment = { ...process.env, ELERA_CLUSTER_SIZE: String(config.clusterSize) };
const routingBundles = createRoutingBundleService({
  managed,
  observationStore,
  environment: routingEnvironment,
  assignmentStore: sharedRoutingAssignments,
  validateAddresses: true,
  resolveAddress: (host) => dns.lookup(host),
  log,
});
const routingEvent = createRoutingEventSnapshot({
  observationStore,
  assignmentStore: sharedRoutingAssignments,
  environment: routingEnvironment,
  nodeIdentity: identity,
  getDrained: () => drained,
});
const routingBus = createRoutingEventBus({ log });
const publishDrainEvent = createDrainEventPublisher({ bus: routingBus, node: identity.name, getReady: () => health.status(), getContext: () => ({ nodeIdentity: identity, reconnectDeadlineMs: config.shutdownTimeoutMs, ...(process.env.ELERA_LOAD_BALANCER_ENDPOINT ? { loadBalancerEndpoint: process.env.ELERA_LOAD_BALANCER_ENDPOINT } : {}) }), log });
const routingStream = createRoutingStream({
  token: process.env.ROOT_TOKEN,
  nodeIdentity: identity,
  authorize: async (supplied, application) => {
    if (!supplied) return false;
    if (process.env.ROOT_TOKEN && supplied === process.env.ROOT_TOKEN) return true;
    const auth = await managed?.authenticate?.(supplied);
    if (!auth || (application && auth.application && auth.application !== application)) return false;
    return auth;
  },
  getEvent: routingEvent,
  bus: routingBus,
  telemetry,
  log,
  loadBalancerEndpoint: process.env.ELERA_LOAD_BALANCER_ENDPOINT,
});
const updateLocalSqlRoute = createSqlDrainIntegration({
  getClient: () => db,
  node: identity.name,
  log,
});
const drain = createDrainManager({
  onChange: (value) => {
    telemetry.recordEvent(value ? "traffic.drain" : "traffic.undrain");
    drained = value;
    updateLocalSqlRoute(value);
    log.info(value ? "Traffic drained" : "Traffic undrained");
    void publishDrainEvent(value);
  },
});
const sqlQuiesce = createSqlQuiesce({ drain, timeoutMs: config.drainTimeoutMs });
const clusterDrain = createDrainPropagation({
  drain,
  peers: (process.env.ELERA_PEERS ?? "").split(","),
  token: process.env.ELERA_PEER_TOKEN ?? process.env.ROOT_TOKEN,
  log,
});
const control = createControlApi({
  db: { query: (...args) => db.query(...args) },
  metadata,
  managed,
  applications,
  reconciler,
  artifactStore,
  routingBundles,
  routingEvent,
  recovery,
  observationStore,
  lifecycle: createLifecycleManager({
    status: () => health.status(),
    operations: createClusterOperations({
      query: (...args) => db.query(...args),
      processController: { start: (...args) => mariaProcess?.start?.(...args) },
      setDrain: (value) => clusterDrain.set(value),
    }),
    environment: process.env,
    config,
  }),
  getConfig: () => config,
  getStatus: () => health.status(),
  getTelemetry: () => telemetry.summary(),
  getTelemetryDetails: (application) => telemetry.details(application),
  getTraffic: () => ({
    drained: drain.isDraining(),
    lifecycle: lifecycle.get(),
    active: drain.active(),
    ...health.cacheInfo(),
  }),
  setDrain: (value, propagated) => clusterDrain.set(value, propagated),
  bootstrap: () => bootstrapMaria?.(),
  getColdBootstrap: () => coldBootstrapService,
  getColdEvidence: () => coldEvidence,
  getColdRecoveryProtocol: () => coldRecoveryProtocol,
  getColdBootstrapLocal: () => coldBootstrapLocal?.(),
  getActiveIntent: Object.assign(() => loadIntent(process.env), {
    ...intentState,
    apply: (intent) => applyIntent(intent),
  }),
  leaseCredentials: (request) => routingBundles.lease(request),
  environment: process.env,
  log,
});
const probes = createProbeServer({
  getStatus: () => health.status(),
  isDraining: () => drain.isDraining(),
  isShuttingDown: () => ['draining', 'stopping', 'stopped'].includes(lifecycle.get()),
  controlHandler: (request, response) => control.handler(request, response),
  upgradeHandler: (request, socket, head) =>
    routingStream.upgrade(request, socket, head),
  log,
});
servers.push(probes);

async function closeServer(server) {
  if (server.listening) await new Promise((resolve) => server.close(resolve));
}
let mariaProcess;
let startupServer;
let recoveryCompletion;
const shutdown = createShutdown({
  lifecycle,
  sqlQuiesce,
  drain,
  propagateDrain: () => clusterDrain.set(true),
  shutdownCondition: () => shutdownCondition({ clusterSize: config.clusterSize, observations: observationStore.snapshot(), localNodeId: identity.name }),
  getTimers: () => [peerTimer, routingTimer],
  routingBus,
  routingStream,
  telemetry,
  servers,
  closeServer,
  getMariaProcess: () => mariaProcess,
  getDb: () => db,
  shutdownTimeoutMs: config.shutdownTimeoutMs,
  errors,
  log,
});
const signals = registerSignals({ log, shutdownHook: shutdown, exitCode: 0 });

async function main() {
  telemetry.start();
  await observationStore.initialize?.();
  log.info("Elera supervisor starting", {
    elera: config.elera,
    httpPort: config.httpPort,
  });
  const initialIntent = (await intentState.read()) ?? loadIntent({ ...process.env, RUNTIME_NODE_NAME: identity.name, RUNTIME_NODE_ADDRESS: identity.address });
  // The persisted intent is authoritative for quorum size; environment
  // defaults may not describe the deployed cluster.
  routingEnvironment.ELERA_CLUSTER_SIZE = String(initialIntent.cluster.members.length);
  await intentState.apply(initialIntent);
  let args = mariaDbArguments({
    ...config,
    intentConfigPath: intentState.paths.renderedPath,
  });
  const localEvidence = createColdBootstrapEvidence({ localNode: identity, dataDir: config.dataDir, health, token: process.env.ROOT_TOKEN, read: undefined, run: (directory) => runWsrepRecover(directory), log });
  coldEvidence = localEvidence.local;
    const members = initialIntent.cluster.members.map((member) => ({ ...member, local: member.name === identity.name, url: `http://${member.address}:${config.httpPort}` }));
    const recoveryStore = createRecoveryDecisionStore(process.env.ELERA_RECOVERY_DECISION_PATH ?? '/run/elera/cold-recovery.json');
    coldRecoveryProtocol = createColdRecoveryProtocol({
      nodes: members,
      localEvidence: localEvidence.local,
      fetchEvidence: localEvidence.remote,
      store: recoveryStore,
      publishEvent: async (event) => recoveryAudit.event(event),
    });
    let startupDecision = { mode: 'standalone', reason: 'single-node configuration' };
  if (config.elera) {
    const explicit = explicitStartupDecision(process.env, identity.name);
    if (explicit) {
      startupDecision = explicit;
      if (explicit.mode === 'bootstrap') {
        await promoteSafeToBootstrap(`${config.dataDir}/grastate.dat`);
        args = startupArguments(args, explicit);
      }
    }
    else {
    recoveryState.set('collecting-evidence');
    const startupEvidence = createStartupLocalEvidence({ node: identity, dataDir: config.dataDir, readState: (directory) => readStateFile(directory), runRecover: (directory) => runWsrepRecover(directory), inspect: inspectDataDirectory, isActive: () => Boolean(mariaProcess?.child && mariaProcess.child.exitCode === null) });
    recoveryCompletion = createRecoveryCompletion();
    startupServer = createStartupEvidenceServer({ port: config.httpPort, token: process.env.ELERA_PEER_TOKEN ?? process.env.ROOT_TOKEN, evidence: startupEvidence, lease: createRecoveryLease('/run/elera/cold-recovery.lease'), completion: recoveryCompletion, log });
    await startupServer.listen();
    const recoveryPlan = await coldRecoveryProtocol.plan();
    startupDecision = recoveryPlan.mode === 'join'
      ? { mode: 'join', reason: recoveryPlan.reason, epoch: null, evidence: recoveryPlan.evidence }
      : recoveryPlan.eligible
        ? { mode: 'bootstrap', winner: recoveryPlan.winner.node, localWinner: recoveryPlan.winner.node === identity.name, reason: recoveryPlan.reason, epoch: recoveryPlan.epoch, recoveryEpoch: recoveryPlan, evidence: recoveryPlan.evidence }
        : { mode: 'blocked', reason: recoveryPlan.reason, epoch: null, evidence: recoveryPlan.evidence };
    recoveryAudit.evidence({ nodes: startupDecision.evidence?.length ?? 0, mode: startupDecision.mode });
    if (startupDecision.winner) recoveryAudit.winner({ winner: startupDecision.winner, epoch: startupDecision.epoch });
    recoveryState.set(startupDecision.mode === 'bootstrap' ? 'awaiting-quorum' : startupDecision.mode === 'join' ? 'joining' : 'blocked-ambiguous', { reason: startupDecision.reason, epoch: startupDecision.epoch });
    await createRecoveryDecisionStore(process.env.ELERA_RECOVERY_DECISION_PATH ?? '/run/elera/cold-recovery.json').write(startupDecision);
    if (startupDecision.localWinner === true && startupDecision.mode === 'bootstrap') {
      const claims = await Promise.all(members.map(async (node) => {
        const url = node.local ? `http://127.0.0.1:${config.httpPort}` : node.url;
        try { const response = await fetch(`${url}/api/v1/cluster/cold-bootstrap/lease`, { method: 'POST', headers: { authorization: `Bearer ${process.env.ELERA_PEER_TOKEN ?? process.env.ROOT_TOKEN}`, 'content-type': 'application/json' }, body: JSON.stringify({ epoch: startupDecision.epoch, winner: startupDecision.winner }), signal: AbortSignal.timeout(config.timeoutMs) }); const granted = response.ok && (await response.json()).data?.granted === true; recoveryAudit.lease({ node: node.name, granted, epoch: startupDecision.epoch }); return granted; } catch { recoveryAudit.lease({ node: node.name, granted: false, epoch: startupDecision.epoch }); return false; }
      }));
      if (claims.filter(Boolean).length >= Math.floor(members.length / 2) + 1) {
        const acknowledgements = members.filter((_, index) => claims[index]).map((node) => node.name);
        await coldRecoveryProtocol.authorize({ epoch: startupDecision.epoch, acknowledgements });
        await coldRecoveryProtocol.beginBootstrap({ epoch: startupDecision.epoch, winner: startupDecision.winner });
        recoveryState.set('recovery-authorized', { reason: startupDecision.reason, epoch: startupDecision.epoch });
        recoveryAudit.authorization({ winner: startupDecision.winner, epoch: startupDecision.epoch });
        recoveryAudit.bootstrapStart({ winner: startupDecision.winner, epoch: startupDecision.epoch });
        await promoteSafeToBootstrap(`${config.dataDir}/grastate.dat`);
        args = startupArguments(mariaDbArguments({ ...config, intentConfigPath: intentState.paths.renderedPath, environment: { ...config.environment, ELERA_CLUSTER_BOOTSTRAP: 'true' } }), startupDecision);
      } else {
        startupDecision = { ...startupDecision, mode: 'blocked', reason: 'recovery lease quorum was not acquired' };
        recoveryState.set('blocked-ambiguous', { reason: startupDecision.reason, epoch: startupDecision.epoch });
        log.warn('Cold recovery bootstrap refused without lease quorum', { epoch: startupDecision.epoch });
      }
    }
    if (startupDecision.mode === 'bootstrap' && startupDecision.localWinner !== true && startupDecision.winner) {
      try {
        await waitForRecoveryCompletion({ url: members.find((node) => node.name === startupDecision.winner)?.url, epoch: startupDecision.epoch, token: process.env.ELERA_PEER_TOKEN ?? process.env.ROOT_TOKEN, timeoutMs: config.startupTimeoutMs });
        startupDecision = { ...startupDecision, mode: 'join', bootstrapComplete: true };
      } catch (error) {
        startupDecision = { ...startupDecision, mode: 'blocked', reason: error.message };
        recoveryState.set('blocked-ambiguous', { reason: error.message, epoch: startupDecision.epoch });
      }
    }
    if (!(startupDecision.mode === 'bootstrap' && startupDecision.localWinner === true)) await startupServer.close();
    }
  }
  if (config.elera && startupDecision.mode === 'bootstrap' && startupDecision.localWinner === true) recoveryState.set('bootstrapping', { epoch: startupDecision.epoch });
  log.info('Startup recovery decision completed', { mode: startupDecision.mode, winner: startupDecision.winner, epoch: startupDecision.epoch, reason: startupDecision.reason });
  coldBootstrapService = createColdBootstrapCoordinator({
    nodes: members,
    local: localEvidence.local,
    remote: localEvidence.remote,
    bootstrapLocal: () => coldBootstrapLocal?.(),
    bootstrapRemote: async (node) => {
      const response = await fetch(`${node.url}/api/v1/cluster/cold-bootstrap/local`, { method: 'POST', headers: { accept: 'application/json', 'content-type': 'application/json', 'x-elera-internal': 'true', 'x-elera-peer-token': process.env.ELERA_PEER_TOKEN ?? process.env.ROOT_TOKEN, authorization: `Bearer ${process.env.ROOT_TOKEN}` }, body: JSON.stringify({ confirm: true }), signal: AbortSignal.timeout(config.timeoutMs) });
      if (!response.ok) throw Object.assign(new Error(`candidate supervisor returned ${response.status}`), { statusCode: response.status });
      return response.json();
    },
    lockPath: '/run/elera/cold-bootstrap.lock',
    log,
  });
  mariaProcess = createMariaDbProcess({
    args,
    log,
    onUnexpectedExit: (code) => {
      if (config.elera) recoveryState.set('cluster-unavailable', { reason: `mariadbd exited with ${code ?? 'unknown'}` });
      if (config.elera) recoveryAudit.failure({ reason: `mariadbd exited with ${code ?? 'unknown'}` });
      if (!restarting && !shuttingDown) process.exit(code ?? 1);
    },
  });
  coldBootstrapLocal = createColdBootstrapAction({
    processController: mariaProcess,
    args,
    timeoutMs: config.timeoutMs,
    log,
    isBusy: () => restarting,
    setBusy: (value) => { restarting = value; },
  });
  applyIntent = async (desired) => {
    const active = (await intentState.read()) ?? loadIntent(process.env);
    const plan = planIntent(desired, active);
    if (plan.change === "unsafe")
      throw Object.assign(new Error(plan.reason), {
        statusCode: 409,
        code: "UNSAFE_INTENT_CHANGE",
      });
    const result = await intentState.apply(desired);
    if (plan.change === "reload") mariaProcess.child?.kill("SIGHUP");
    if (plan.change === "restart") {
      restarting = true;
      try {
        await mariaProcess.stop(config.timeoutMs);
        await mariaProcess.start(args);
      } finally {
        restarting = false;
      }
    }
    return result;
  };
  if (!shouldStartMariaDb({ elera: config.elera, mode: startupDecision.mode })) {
    log.warn("MariaDB start refused until explicit recovery authority is available", { reason: startupDecision.reason });
  } else mariaProcess.start().then(() => {
    if (config.elera && startupDecision.mode === 'join') { recoveryState.set('joining', { reason: startupDecision.reason }); recoveryAudit.joinStart({ node: identity.name, epoch: startupDecision.epoch }); }
    if (config.elera && startupDecision.mode === 'bootstrap' && startupDecision.localWinner === true) void createBootstrapWatch({
      health,
      timeoutMs: config.startupTimeoutMs,
      isReady: (result) => result.values?.wsrep_local_state_comment === 'Synced' && result.values?.wsrep_ready === 'ON' && result.values?.wsrep_cluster_status === 'Primary',
      onTimeout: async () => {
        recoveryState.set('cluster-unavailable', { reason: 'bootstrap did not form a ready Primary view before timeout', epoch: startupDecision.epoch });
        recoveryAudit.failure({ reason: 'bootstrap readiness timeout', epoch: startupDecision.epoch });
        recoveryCompletion?.publish({ epoch: startupDecision.epoch, status: 'failed', reason: 'bootstrap readiness timeout' });
        await mariaProcess.stop(config.shutdownTimeoutMs);
        await startupServer?.close();
      },
    })().then(async (result) => {
      if (result.ready) {
        await coldRecoveryProtocol?.complete({ epoch: startupDecision.epoch, clusterId: startupDecision.recoveryEpoch?.clusterId, winner: identity.name, membership: startupDecision.recoveryEpoch?.quorum });
        recoveryState.set('complete', { reason: 'bootstrap completed with expected Primary membership', epoch: startupDecision.epoch });
        recoveryCompletion?.publish({ epoch: startupDecision.epoch, status: 'complete', clusterId: startupDecision.recoveryEpoch?.clusterId, winner: identity.name });
        recoveryAudit.completion?.({ epoch: startupDecision.epoch, winner: identity.name });
        await startupServer?.close();
      }
    });
  }).catch((error) => {
    log.error("Failed to start mariadbd", { error });
    void signals.shutdown("mariadbd-error");
  });
  bootstrapMaria = createEleraBootstrap({
    processController: mariaProcess,
    args,
    health,
    timeoutMs: config.timeoutMs,
    dataDir: config.dataDir,
    log,
    isBusy: () => restarting,
    setBusy: (value) => {
      restarting = value;
    },
  });
  db = createSupervisorSqlClient({
    host: dbEnv.MYSQL_HOST,
    port: dbEnv.MYSQL_PORT,
    user: dbEnv.MYSQL_USER,
    password: dbEnv.MYSQL_PASSWORD,
    database: dbEnv.MYSQL_DATABASE,
    socketPath: dbEnv.MYSQL_SOCKET,
  });
  probes.listen(config.httpPort, "0.0.0.0", () =>
    log.info("HTTP listener started", { port: config.httpPort }),
  );
  const sqlReady = await waitForSql({ health, timeoutMs: config.startupTimeoutMs, log });
  if (!sqlReady) {
    log.warn("MariaDB is not SQL-ready; supervisor remains available for explicit recovery", {
      timeoutMs: config.startupTimeoutMs,
    });
  }
  if (config.elera && startupDecision.mode === 'join' && sqlReady) {
    const joined = await health.status().catch(() => ({ ready: false, values: {} }));
    const validJoin = verifyJoinedMember({ values: joined.values, expectedClusterId: startupDecision.recoveryEpoch?.clusterId, expectedSize: initialIntent.cluster.members.length }).valid;
    if (validJoin) { recoveryState.set('complete', { reason: 'joined Primary cluster', epoch: startupDecision.epoch }); recoveryAudit.joinComplete({ node: identity.name, epoch: startupDecision.epoch }); }
    else recoveryAudit.failure({ reason: 'join did not reach expected Synced Primary membership', epoch: startupDecision.epoch });
  }
  const publishedVersions = new Map();
  const publishRoutingEvent = () => {
    const applications = new Set([process.env.ELERA_APPLICATION ?? "default", ...sharedRoutingAssignments.applications()]);
    for (const application of applications) {
      const event = routingEvent(application);
      if (event && event.version !== publishedVersions.get(application)) {
        publishedVersions.set(application, event.version);
        routingBus.publish(event);
      }
    }
  };
  routingTimer = setInterval(publishRoutingEvent, 1000);
  routingTimer.unref?.();
  publishRoutingEvent();
  const peers = (process.env.ELERA_PEERS ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  if (peers.length) {
    const peerClient = createPeerObservationClient({
      peers,
      token: process.env.ELERA_PEER_TOKEN ?? process.env.ROOT_TOKEN,
      store: observationStore,
      log,
    });
    const publish = async () => {
      const current = await health
        .status()
        .catch(() => ({ ready: false, values: {} }));
      const observation = {
        nodeId: identity.name,
        clusterId: initialIntent.cluster.name,
        state:
          current.values?.wsrep_local_state_comment ??
          (current.ready ? "Ready" : "Down"),
        synced: current.values?.wsrep_local_state_comment === "Synced",
        primary: current.values?.wsrep_cluster_status ?? "Unknown",
        health: current.ready ? "ok" : "not-ready",
        load: current.values ?? {},
        drain: drained,
        address: clientSqlAddress(process.env),
        sqlPort: Number(process.env.ELERA_NODE_SQL_PORT ?? 3306),
        observedAt: Date.now(),
      };
      observationStore.upsert(observation);
      await peerClient.publish(observation);
      await peerClient.refresh();
    };
    peerTimer = setInterval(() => {
      void publish();
    }, 1000);
    void publish();
  }
  log.info("Elera supervisor started");
}

function runWsrepRecover(directory) {
  return new Promise((resolve, reject) => {
    const child = spawn('mariadbd', [`--defaults-extra-file=/run/elera/mariadb.cnf`, `--datadir=${directory}`, '--user=mysql', '--skip-networking', '--wsrep-recover'], { stdio: ['ignore', 'pipe', 'pipe'] });
    let output = '';
    child.stdout.on('data', (value) => { output += value; });
    child.stderr.on('data', (value) => { output += value; });
    child.once('error', reject);
    child.once('exit', (code) => code === 0 ? resolve(output) : reject(new Error(`mariadbd wsrep recovery exited with ${code}`)));
  });
}
main().catch((error) => {
  log.error("Supervisor startup failed", { error });
  void signals.shutdown("startup-failure").then(() => process.exit(1));
});
