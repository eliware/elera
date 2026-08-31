import { log, registerHandlers, registerSignals } from "@eliware/common";
import { createPendingInitServer } from "./server.mjs";
import { createClusterHandoff } from "./handoff.mjs";
import { createNodeDataReset } from "../node-data-reset.mjs";
import { runtimeIdentity } from "../../runtime/identity.mjs";

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
  const nodeDataReset = createNodeDataReset({ node: environment.RUNTIME_NODE_NAME ?? identity.name, dataDir: environment.MARIADB_DATA_DIR ?? "/var/lib/mysql", getStatus: async () => { throw new Error("SQL unavailable during pending recovery"); }, offlineRecovery: true, getRecoveryState: () => ({ state: "pending" }), audit: logger });
  const pending = createPendingInitServer({ environment, log: logger, nodeDataReset, onInitialized: (operation) => {
    close(pending.server);
    void handoff(operation === "bootstrap")().catch((error) => logger.error?.("Pending initialization handoff failed", { error }));
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
