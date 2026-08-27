#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { closeDb, createDb } from '@eliware/mysql';
import { log, registerHandlers, registerSignals } from '@eliware/common';
import { loadSupervisorConfig, mariaDbArguments } from './config.mjs';
import { createHealthService } from './health.mjs';
import { listenAgent } from './agent.mjs';
import { createProbeServer } from './probes.mjs';
import { createControlApi } from './control-api.mjs';

const config = loadSupervisorConfig();
const dbEnv = { ...process.env, MYSQL_HOST: '127.0.0.1', MYSQL_PORT: '3306', MYSQL_USER: process.env.MARIADB_USER ?? 'root', MYSQL_PASSWORD: process.env.MARIADB_PASSWORD ?? '', MYSQL_DATABASE: process.env.MARIADB_DATABASE ?? 'mysql' };
let db; let mariadbd; let drained = false; let shuttingDown = false; let restarting = false; let bootstrapMaria;
const servers = [];
const errors = registerHandlers({ log, events: ['uncaughtException', 'unhandledRejection', 'warning'] });
const health = createHealthService({ db: { query: (...args) => db.query(...args) }, timeoutMs: config.timeoutMs, log });
const control = createControlApi({ db: { query: (...args) => db.query(...args) }, getStatus: () => health.status(), getTraffic: () => ({ drained, ...health.cacheInfo() }), setDrain: (value) => { drained = value; log.info(value ? 'Traffic drained' : 'Traffic undrained'); }, bootstrap: () => bootstrapMaria?.(), environment: process.env, log });
const probes = createProbeServer({ getStatus: () => health.status(), controlHandler: (request, response) => control.handler(request, response), log });
servers.push(probes);

async function closeServer(server) { if (server.listening) await new Promise((resolve) => server.close(resolve)); }
async function shutdown(signal) { if (shuttingDown) { log.warn('Shutdown already in progress', { signal }); return; } shuttingDown = true; log.info('Supervisor shutting down', { signal }); await Promise.all(servers.map(closeServer)); await closeDb(db).catch((error) => log.error('Database pool close failed', { error })); errors.removeHandlers(); }
const signals = registerSignals({ log, shutdownHook: shutdown, exitCode: 0 });

async function main() {
  log.info('Galera supervisor starting', { galera: config.galera, httpPort: config.httpPort, agentPort: config.agentPort, performancePort: config.performancePort });
  const startMaria = (args) => new Promise((resolve, reject) => { mariadbd = spawn('mariadbd', args, { stdio: 'inherit' }); mariadbd.once('error', reject); mariadbd.once('exit', (code, signal) => { log.error('mariadbd exited', { code, signal }); if (restarting) resolve(); else if (!shuttingDown) process.exit(code ?? 1); }); });
  const args = mariaDbArguments(config);
  startMaria(args).catch((error) => { log.error('Failed to start mariadbd', { error }); void signals.shutdown('mariadbd-error'); });
  bootstrapMaria = async () => { if (restarting) throw Object.assign(new Error('bootstrap already in progress'), { statusCode: 409 }); const current = await health.status().catch(() => ({ ready: false })); if (current.ready) throw Object.assign(new Error('node is already ready; bootstrap refused'), { statusCode: 409 }); restarting = true; log.warn('Restarting MariaDB for Galera bootstrap'); mariadbd.kill('SIGTERM'); await new Promise((resolve) => mariadbd.once('exit', resolve)); const bootstrapArgs = [...args.filter((arg) => arg !== '--wsrep-new-cluster'), '--wsrep-new-cluster']; startMaria(bootstrapArgs).catch((error) => { log.error('Galera bootstrap MariaDB failed', { error }); }); restarting = false; };
  db = await createDb({ env: dbEnv, log });
  probes.listen(config.httpPort, '0.0.0.0', () => log.info('HTTP listener started', { port: config.httpPort }));
  servers.push(listenAgent({ port: config.agentPort, performance: false, timeoutMs: config.timeoutMs, getStatus: () => health.status(), isDrained: () => drained, log }));
  servers.push(listenAgent({ port: config.performancePort, performance: true, timeoutMs: config.timeoutMs, getStatus: () => health.status(), isDrained: () => drained, log }));
  log.info('Galera supervisor started');
}
main().catch((error) => { log.error('Supervisor startup failed', { error }); void signals.shutdown('startup-failure').then(() => process.exit(1)); });
