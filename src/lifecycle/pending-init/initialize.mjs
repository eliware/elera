import { executeSql, runCommand, startPrivateMariaDb } from "./processes.mjs";
import { initializationSql } from "./sql.mjs";
export const wait = (delayMs) => new Promise((resolve) => setTimeout(resolve, delayMs));
export async function initializePendingData({ environment = process.env, log = console, run = runCommand, start = startPrivateMariaDb, execute = executeSql, sleep = wait } = {}) {
  const dataDir = environment.MARIADB_DATA_DIR ?? "/var/lib/mysql";
  const socket = "/run/mysqld/pending-init.sock";
  if (!environment.MARIADB_ROOT_PASSWORD) throw new Error("MARIADB_ROOT_PASSWORD is required for explicit initialization");
  await run("mariadb-install-db", ["--user=mysql", `--datadir=${dataDir}`, "--skip-test-db", "--auth-root-authentication-method=normal"]);
  const server = start({ dataDir, socket });
  try {
    for (let attempts = 0; attempts < 60; attempts += 1) {
      try { await run("mariadb-admin", [`--socket=${socket}`, "ping", "--silent"]); break; }
      catch (error) { if (attempts === 59) throw error; await sleep(1000); }
    }
    await execute({ socket, sql: initializationSql({ rootPassword: environment.MARIADB_ROOT_PASSWORD, database: environment.MARIADB_DATABASE, user: environment.MARIADB_USER, password: environment.MARIADB_PASSWORD }) });
  } finally { server.kill("SIGTERM"); await new Promise((resolve) => server.once("exit", resolve)); }
  log.info?.("Explicit pending initialization completed");
}
