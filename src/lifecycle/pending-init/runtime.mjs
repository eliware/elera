import { log, registerHandlers, registerSignals } from "@eliware/common";
import { createPendingInitServer } from "./server.mjs";
import { createClusterHandoff } from "./handoff.mjs";

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
  const pending = createPendingInitServer({ environment, log: logger, onInitialized: (operation) => {
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
