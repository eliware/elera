#!/usr/bin/env node
import { createDbFromEnvironment } from '@eliware/galera-lib';
import { log, registerHandlers, registerSignals } from '@eliware/common';
import { loadSupervisorConfig, mariaDbArguments } from './config.mjs';
import { createHealthService } from './health.mjs';
import { listenAgent } from './agent.mjs';
import { createProbeServer } from './probes.mjs';
import { createControlApi } from './control-api.mjs';
import { createMariaDbProcess } from './lifecycle/mariadb-process.mjs';
import { createGaleraBootstrap, waitForSql } from './lifecycle/startup.mjs';
import { createBootstrapCredentialLease } from './credentials/bootstrap.mjs';

const config = loadSupervisorConfig();
const dbEnv = { ...process.env, MYSQL_HOST: '127.0.0.1', MYSQL_PORT: '3306', MYSQL_USER: process.env.MARIADB_USER ?? 'root', MYSQL_PASSWORD: process.env.MARIADB_PASSWORD ?? '', MYSQL_DATABASE: process.env.MARIADB_DATABASE ?? 'mysql' };
let db; let drained = false; let shuttingDown = false; let restarting = false; let bootstrapMaria;
const servers = [];
const errors = registerHandlers({ log, events: ['uncaughtException', 'unhandledRejection', 'warning'] });
const health = createHealthService({ db: { query: (...args) => db.query(...args) }, timeoutMs: config.timeoutMs, galera: config.galera, log });
const control = createControlApi({ db: { query: (...args) => db.query(...args) }, getStatus: () => health.status(), getTraffic: () => ({ drained, ...health.cacheInfo() }), setDrain: (value) => { drained = value; log.info(value ? 'Traffic drained' : 'Traffic undrained'); }, bootstrap: () => bootstrapMaria?.(), leaseCredentials: createBootstrapCredentialLease(process.env), environment: process.env, log });
const probes = createProbeServer({ getStatus: () => health.status(), controlHandler: (request, response) => control.handler(request, response), log });
servers.push(probes);

async function closeServer(server) { if (server.listening) await new Promise((resolve) => server.close(resolve)); }
let mariaProcess;
async function shutdown(signal) { if (shuttingDown) { log.warn('Shutdown already in progress', { signal }); return; } shuttingDown = true; log.info('Supervisor shutting down', { signal }); await Promise.all(servers.map(closeServer)); await mariaProcess?.stop(config.timeoutMs); await db?.close?.().catch((error) => log.error('Database pool close failed', { error })); errors.removeHandlers(); }
const signals = registerSignals({ log, shutdownHook: shutdown, exitCode: 0 });

async function main() {
  log.info('Galera supervisor starting', { galera: config.galera, httpPort: config.httpPort, agentPort: config.agentPort, performancePort: config.performancePort });
  const args = mariaDbArguments(config);
  mariaProcess = createMariaDbProcess({ args, log, onUnexpectedExit: (code) => { if (!restarting && !shuttingDown) process.exit(code ?? 1); } });
  mariaProcess.start().catch((error) => { log.error('Failed to start mariadbd', { error }); void signals.shutdown('mariadbd-error'); });
  bootstrapMaria = createGaleraBootstrap({ processController: mariaProcess, args, health, timeoutMs: config.timeoutMs, log, isBusy: () => restarting, setBusy: (value) => { restarting = value; } });
  db = await createDbFromEnvironment({ env: dbEnv, log });
  probes.listen(config.httpPort, '0.0.0.0', () => log.info('HTTP listener started', { port: config.httpPort }));
  if (!await waitForSql({ health, timeoutMs: config.startupTimeoutMs, log })) throw new Error(`MariaDB did not become SQL-ready within ${config.startupTimeoutMs}ms`);
  servers.push(listenAgent({ port: config.agentPort, performance: false, timeoutMs: config.timeoutMs, getStatus: () => health.status(), isDrained: () => drained, log }));
  servers.push(listenAgent({ port: config.performancePort, performance: true, timeoutMs: config.timeoutMs, getStatus: () => health.status(), isDrained: () => drained, log }));
  log.info('Galera supervisor started');
}
main().catch((error) => { log.error('Supervisor startup failed', { error }); void signals.shutdown('startup-failure').then(() => process.exit(1)); });
