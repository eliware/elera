#!/usr/bin/env node
import { createDbFromEnvironment } from "@eliware/elera-lib";
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
import { createRoutingStream } from "./api/routing-stream.mjs";
import { createDrainManager } from "./lifecycle/drain-manager.mjs";
import { createSqlQuiesce } from "./lifecycle/sql-quiesce.mjs";
import { createSqlDrainIntegration } from "./lifecycle/sql-routing.mjs";
import { createDrainPropagation } from "./cluster/drain-propagation.mjs";
import { createLifecycleState } from "./lifecycle/state.mjs";
import { createShutdown } from "./lifecycle/shutdown.mjs";
import { createDrainEventPublisher } from "./lifecycle/drain-events.mjs";

const config = loadSupervisorConfig();
// Supervisor control-plane SQL uses the bootstrap root credential; application credentials
// are leased separately and must never be used for provisioning or reconciliation.
const dbEnv = {
  ...process.env,
  MYSQL_HOST: "127.0.0.1",
  MYSQL_PORT: "3306",
  MYSQL_SOCKET: "/run/mysqld/mysqld.sock",
  MYSQL_USER: "root",
  MYSQL_PASSWORD: process.env.MARIADB_ROOT_PASSWORD ?? "",
  MYSQL_DATABASE: process.env.MARIADB_DATABASE ?? "mysql",
};
let db;
let drained = false;
let shuttingDown = false;
let restarting = false;
const lifecycle = createLifecycleState({ initial: "serving", onChange: (state) => log.info("Supervisor lifecycle changed", { state }) });
let bootstrapMaria;
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
  log,
});
const intentState = createIntentState({
  stateDir: process.env.ELERA_CONFIG_STATE_DIR ?? "/run/elera",
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
const routingBundles = createRoutingBundleService({
  managed,
  observationStore,
  environment: process.env,
});
const routingEvent = createRoutingEventSnapshot({
  observationStore,
  environment: process.env,
  getDrained: () => drained,
});
const routingBus = createRoutingEventBus({ log });
const publishDrainEvent = createDrainEventPublisher({ bus: routingBus, node: process.env.ELERA_NODE_NAME ?? "elera", getReady: () => health.status(), log });
const routingStream = createRoutingStream({
  token: process.env.ROOT_TOKEN,
  getEvent: routingEvent,
  bus: routingBus,
  log,
});
const updateLocalSqlRoute = createSqlDrainIntegration({
  getClient: () => db,
  node: process.env.ELERA_NODE_NAME ?? "elera",
  log,
});
const drain = createDrainManager({
  onChange: (value) => {
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
  reconciler,
  artifactStore,
  routingBundles,
  routingEvent,
  observationStore,
  lifecycle: createLifecycleManager({
    status: () => health.status(),
    operations: createClusterOperations({
      query: (...args) => db.query(...args),
      processController: { start: (...args) => mariaProcess?.start?.(...args) },
      setDrain: (value) => clusterDrain.set(value),
    }),
    environment: process.env,
  }),
  getStatus: () => health.status(),
  getTraffic: () => ({
    drained: drain.isDraining(),
    lifecycle: lifecycle.get(),
    active: drain.active(),
    ...health.cacheInfo(),
  }),
  setDrain: (value, propagated) => clusterDrain.set(value, propagated),
  bootstrap: () => bootstrapMaria?.(),
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
const shutdown = createShutdown({
  lifecycle,
  sqlQuiesce,
  drain,
  getTimers: () => [peerTimer, routingTimer],
  routingBus,
  routingStream,
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
  await observationStore.initialize?.();
  log.info("Elera supervisor starting", {
    elera: config.elera,
    httpPort: config.httpPort,
  });
  const initialIntent = loadIntent(process.env);
  await intentState.apply(initialIntent);
  const args = mariaDbArguments({
    ...config,
    intentConfigPath: intentState.paths.renderedPath,
  });
  mariaProcess = createMariaDbProcess({
    args,
    log,
    onUnexpectedExit: (code) => {
      if (!restarting && !shuttingDown) process.exit(code ?? 1);
    },
  });
  applyIntent = async (desired) => {
    const active = loadIntent(process.env);
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
  mariaProcess.start().catch((error) => {
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
  db = await createDbFromEnvironment({ env: dbEnv, log });
  probes.listen(config.httpPort, "0.0.0.0", () =>
    log.info("HTTP listener started", { port: config.httpPort }),
  );
  if (!(await waitForSql({ health, timeoutMs: config.startupTimeoutMs, log })))
    throw new Error(
      `MariaDB did not become SQL-ready within ${config.startupTimeoutMs}ms`,
    );
  let publishedVersion = 0;
  const publishRoutingEvent = () => {
    const event = routingEvent(process.env.ELERA_APPLICATION ?? "default");
    if (event && event.version !== publishedVersion) {
      publishedVersion = event.version;
      routingBus.publish(event);
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
        nodeId: process.env.ELERA_NODE_NAME ?? "elera",
        clusterId: process.env.ELERA_CLUSTER_NAME ?? "local-elera",
        state:
          current.values?.wsrep_local_state_comment ??
          (current.ready ? "Ready" : "Down"),
        synced: current.values?.wsrep_local_state_comment === "Synced",
        primary: current.values?.wsrep_cluster_status ?? "Unknown",
        health: current.ready ? "ok" : "not-ready",
        load: current.values ?? {},
        drain: drained,
        address: process.env.ELERA_NODE_ADDRESS ?? "127.0.0.1",
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
main().catch((error) => {
  log.error("Supervisor startup failed", { error });
  void signals.shutdown("startup-failure").then(() => process.exit(1));
});
