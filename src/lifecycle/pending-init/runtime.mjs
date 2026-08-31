import { log, registerHandlers, registerSignals } from "@eliware/common";
import { createPendingInitServer } from "./server.mjs";
import { createClusterHandoff } from "./handoff.mjs";
import { createNodeDataReset } from "../node-data-reset.mjs";
import { runtimeIdentity } from "../../runtime/identity.mjs";
import { createStartupLocalEvidence } from "../../cluster/cold-bootstrap/startup-local-evidence.mjs";
import { readStateFile } from "../../cluster/cold-bootstrap/state-file.mjs";
import { inspectDataDirectory } from "../data-directory.mjs";
import { runWsrepRecover } from "../../runtime/wsrep-recovery.mjs";

export const startPendingInitRuntime = ({
  environment = process.env,
  listen = (server, port, host) => server.listen(port, host),
  close = (server, callback) => server.close(callback),
  spawnProcess,
  exit,
  logger = log,
} = {}) => {
  const errorHandlers = registerHandlers({ events: ["uncaughtException", "unhandledRejection"] });
  let shuttingDown = false;
  const handoff = (bootstrapCluster) => createClusterHandoff({ environment, spawnProcess, exit, bootstrapCluster });
  const identity = runtimeIdentity(environment);
  const coldEvidence = createStartupLocalEvidence({ node: identity, dataDir: environment.MARIADB_DATA_DIR ?? "/var/lib/mysql", readState: (directory) => readStateFile(directory), runRecover: runWsrepRecover, inspect: inspectDataDirectory });
  const nodeDataReset = createNodeDataReset({ node: environment.RUNTIME_NODE_NAME ?? identity.name, dataDir: environment.MARIADB_DATA_DIR ?? "/var/lib/mysql", getStatus: async () => { throw new Error("SQL unavailable during pending recovery"); }, offlineRecovery: true, getRecoveryState: () => ({ state: "pending" }), audit: logger });
  const pending = createPendingInitServer({ environment, log: logger, nodeDataReset, coldEvidence, onInitialized: (operation) => {
    close(pending.server);
    if (operation !== "join-pending") void handoff(operation === "bootstrap")().catch((error) => logger.error?.("Pending initialization handoff failed", { error }));
  } });
  const shutdown = () => {
    if (shuttingDown) return;
    shuttingDown = true;
    close(pending.server, () => errorHandlers.removeHandlers());
  };
  const signals = registerSignals({ log: logger, shutdownHook: shutdown, exitCode: 0 });
  listen(pending.server, Number(environment.ELERA_HTTP_PORT ?? 8080), "0.0.0.0");
  return { server: pending.server, signals, shutdown };
};
