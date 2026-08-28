import { executeSql, runCommand, startPrivateMariaDb } from "./processes.mjs";
import { initializationSql } from "./sql.mjs";
export const wait = (delayMs) => new Promise((resolve) => setTimeout(resolve, delayMs));
export const PENDING_INIT_SOCKET = "/run/mysqld/pending-init.sock";
export async function initializePendingData({ environment = process.env, log = console, run = runCommand, start = startPrivateMariaDb, execute = executeSql, sleep = wait, socket = PENDING_INIT_SOCKET } = {}) {
  const dataDir = environment.MARIADB_DATA_DIR ?? "/var/lib/mysql";
  await run("mariadb-install-db", ["--user=mysql", `--datadir=${dataDir}`, "--auth-root-authentication-method=normal", "--skip-test-db"]);
  const server = start({ dataDir, socket });
  try {
    for (let attempts = 0; attempts < 60; attempts += 1) {
      try { await run("mariadb-admin", [`--socket=${socket}`, "ping", "--silent"]); break; }
      catch (error) { if (attempts === 59) throw error; await sleep(1000); }
    }
  await execute({ socket, sql: initializationSql() });
  } finally { server.kill("SIGTERM"); await new Promise((resolve) => server.once("exit", resolve)); }
  log.info?.("Explicit pending initialization completed");
}
