import { log, registerHandlers, registerSignals } from "@eliware/common";
import { createPendingInitServer } from "./server.mjs";
import { createClusterHandoff } from "./handoff.mjs";
import { createNodeDataReset } from "../node-data-reset.mjs";
import { createStartupLocalEvidence } from "../../cluster/cold-bootstrap/startup-local-evidence.mjs";
import { readStateFile } from "../../cluster/cold-bootstrap/state-file.mjs";
import { inspectDataDirectory } from "../data-directory.mjs";
import { runWsrepRecover } from "../../runtime/wsrep-recovery.mjs";

export const startPendingInitRuntime = ({
  environment = process.env,
  identity: runtimeIdentityValue,
  listen = (server, port, host) => server.listen(port, host),
  close = (server, callback) => server.close(callback),
  spawnProcess,
  exit,
  logger = log,
  recoveryRequired = false,
  recoveryReason = 'recovery evidence is unavailable',
  recoveryProtocol,
  onRecoveryBootstrap = () => {},
  onRecoveryComplete = () => {},
  onRecoveryJoin = () => {},
  recoveryRetryIntervalMs = 1000,
  createServerImpl = createPendingInitServer,
  createEvidenceImpl = createStartupLocalEvidence,
  createResetImpl = createNodeDataReset,
  createHandoffImpl = createClusterHandoff,
} = {}) => {
  if (!runtimeIdentityValue?.name) throw new TypeError('shared runtime identity is required for pending initialization');
  const errorHandlers = registerHandlers({ events: ["uncaughtException", "unhandledRejection"] });
  let shuttingDown = false;
  let listenerClosed = false;
  let retryTimer;
  const closePending = () => {
    if (listenerClosed) return;
    listenerClosed = true;
    if (retryTimer) clearInterval(retryTimer);
    try { close(pending.server); } catch (error) { logger.warn?.('Pending recovery listener close failed', { error }); }
  };
  const handoff = (bootstrapCluster) => createHandoffImpl({ environment, spawnProcess, exit, bootstrapCluster });
  const identity = runtimeIdentityValue;
  const coldEvidence = createEvidenceImpl({ node: identity, dataDir: environment.MARIADB_DATA_DIR ?? "/var/lib/mysql", readState: (directory) => readStateFile(directory), runRecover: runWsrepRecover, inspect: inspectDataDirectory });
  const nodeDataReset = createResetImpl({ node: identity.name, dataDir: environment.MARIADB_DATA_DIR ?? "/var/lib/mysql", getStatus: async () => { throw new Error("SQL unavailable during pending recovery"); }, offlineRecovery: true, getRecoveryState: () => ({ state: "pending" }), audit: logger });
  const pending = createServerImpl({ environment, identity, log: logger, nodeDataReset, coldEvidence, recoveryRequired, recoveryReason, recoveryProtocol, onRecoveryJoin: async (data) => {
    const result = await onRecoveryJoin(data);
    closePending();
    return result;
  }, onRecoveryBootstrap: async (data) => {
    const handoff = await onRecoveryBootstrap(data);
    if (handoff !== false) closePending();
  }, onRecoveryComplete, onInitialized: (operation) => {
    if (operation === "join-pending") return;
    closePending();
    void handoff(operation === "bootstrap")().catch((error) => logger.error?.("Pending initialization handoff failed", { error }));
  } });
  const shutdown = () => {
    if (shuttingDown) return;
    shuttingDown = true;
    if (retryTimer) clearInterval(retryTimer);
    if (listenerClosed) return errorHandlers.removeHandlers();
    listenerClosed = true;
    try { close(pending.server, () => errorHandlers.removeHandlers()); } catch (error) { errorHandlers.removeHandlers(); throw error; }
  };
  const signals = registerSignals({ log: logger, shutdownHook: shutdown, exitCode: 0 });
  try {
    const listening = listen(pending.server, Number(environment.ELERA_HTTP_PORT ?? 8080), "0.0.0.0");
    if (listening && typeof listening.then === 'function') {
      listening.catch((error) => {
        errorHandlers.removeHandlers();
        logger.error?.('Pending recovery listener failed to start', { error });
      });
    }
  } catch (error) {
    errorHandlers.removeHandlers();
    throw error;
  }
  if (recoveryRequired && typeof recoveryProtocol?.retry === 'function') {
    retryTimer = setInterval(() => {
      Promise.resolve(recoveryProtocol.retry()).catch((error) => logger.warn?.('Automatic recovery evidence retry failed', { error }));
    }, Math.max(250, recoveryRetryIntervalMs));
    retryTimer.unref?.();
  }
  const stop = () => {
    if (retryTimer) clearInterval(retryTimer);
    shutdown();
  };
  return { server: pending.server, signals, shutdown: stop };
};
