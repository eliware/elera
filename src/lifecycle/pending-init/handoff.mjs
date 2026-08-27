import { spawn } from "node:child_process";

export const createClusterHandoff = ({
  command = "/usr/local/bin/mariadb-entrypoint.sh",
  environment = process.env,
  spawnProcess = spawn,
  exit = () => {},
  onExit = () => {},
  bootstrapCluster = false,
} = {}) => () => new Promise((resolve, reject) => {
  const child = spawnProcess(command, {
    env: {
      ...environment,
      ELERA_PENDING_INIT: "false",
      ELERA_BOOTSTRAP: "false",
      ELERA_CLUSTER_BOOTSTRAP: bootstrapCluster ? "true" : "false",
    },
    stdio: "inherit",
  });
  child.once("error", reject);
  child.once("exit", (code, signal) => {
    const exitCode = code ?? (signal ? 1 : 0);
    onExit(exitCode, signal);
    exit(exitCode);
    resolve();
  });
});
