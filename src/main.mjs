#!/usr/bin/env node
import { createDbFromEnvironment } from '@eliware/elera-lib';
import { log, registerHandlers, registerSignals } from '@eliware/common';
import { loadSupervisorConfig, mariaDbArguments } from './config.mjs';
import { createHealthService } from './health.mjs';
import { listenAgent } from './agent.mjs';
import { createProbeServer } from './probes.mjs';
import { createControlApi } from './control-api.mjs';
import { createMariaDbProcess } from './lifecycle/mariadb-process.mjs';
import { createEleraBootstrap, waitForSql } from './lifecycle/startup.mjs';
import { createBootstrapCredentialLease } from './credentials/bootstrap.mjs';
import { createMetadataService } from './metadata/service.mjs';
import { createManagedMetadata } from './metadata/managed.mjs';
import { createLifecycleManager } from './cluster/lifecycle.mjs';
import { createObservationStore } from './cluster/observation-store.mjs';
import { createDurableObservationStore } from './cluster/durable-observation-store.mjs';
import { createPeerObservationClient } from './cluster/peer-observations.mjs';
import { createClusterOperations } from './cluster/sql-operations.mjs';
import { loadIntent } from './intent/model.mjs';
import { createIntentState } from './intent/state.mjs';
import { planIntent } from './intent/model.mjs';

const config = loadSupervisorConfig();
// Supervisor control-plane SQL uses the bootstrap root credential; application credentials
// are leased separately and must never be used for provisioning or reconciliation.
const dbEnv = { ...process.env, MYSQL_HOST: '127.0.0.1', MYSQL_PORT: '3306', MYSQL_USER: 'root', MYSQL_PASSWORD: process.env.MARIADB_ROOT_PASSWORD ?? '', MYSQL_DATABASE: process.env.MARIADB_DATABASE ?? 'mysql' };
let db; let drained = false; let shuttingDown = false; let restarting = false; let bootstrapMaria; let peerTimer;
let applyIntent = (intent) => intentState.apply(intent);
const servers = [];
const errors = registerHandlers({ log, events: ['uncaughtException', 'unhandledRejection', 'warning'] });
const health = createHealthService({ db: { query: (...args) => db.query(...args), health: (...args) => db.health(...args) }, timeoutMs: config.timeoutMs, elera: config.elera, log });
const intentState = createIntentState({ stateDir: process.env.ELERA_CONFIG_STATE_DIR ?? '/etc/elera' });
const memoryObservationStore = createObservationStore();
const observationStore = process.env.ELERA_OBSERVATION_STATE_PATH ? createDurableObservationStore({ store: memoryObservationStore, statePath: process.env.ELERA_OBSERVATION_STATE_PATH, log }) : memoryObservationStore;
const metadata = createMetadataService({ query: (...args) => db.query(...args) });
const control = createControlApi({ db: { query: (...args) => db.query(...args) }, metadata, managed: createManagedMetadata({ query: (...args) => db.query(...args) }), observationStore, lifecycle: createLifecycleManager({ status: () => health.status(), operations: createClusterOperations({ query: (...args) => db.query(...args), processController: { start: (...args) => mariaProcess?.start?.(...args) }, setDrain: (value) => { drained = value; } }), environment: process.env }), getStatus: () => health.status(), getTraffic: () => ({ drained, ...health.cacheInfo() }), setDrain: (value) => { drained = value; log.info(value ? 'Traffic drained' : 'Traffic undrained'); }, bootstrap: () => bootstrapMaria?.(), getActiveIntent: Object.assign(() => loadIntent(process.env), { ...intentState, apply: (intent) => applyIntent(intent) }), leaseCredentials: createBootstrapCredentialLease(process.env), environment: process.env, log });
const probes = createProbeServer({ getStatus: () => health.status(), controlHandler: (request, response) => control.handler(request, response), log });
servers.push(probes);

async function closeServer(server) { if (server.listening) await new Promise((resolve) => server.close(resolve)); }
let mariaProcess;
async function shutdown(signal) { if (shuttingDown) { log.warn('Shutdown already in progress', { signal }); return; } shuttingDown = true; log.info('Supervisor shutting down', { signal }); if (peerTimer) clearInterval(peerTimer); await Promise.all(servers.map(closeServer)); await mariaProcess?.stop(config.timeoutMs); await db?.close?.().catch((error) => log.error('Database pool close failed', { error })); errors.removeHandlers(); }
const signals = registerSignals({ log, shutdownHook: shutdown, exitCode: 0 });

async function main() {
  await observationStore.initialize?.();
  log.info('Elera supervisor starting', { elera: config.elera, httpPort: config.httpPort, agentPort: config.agentPort, performancePort: config.performancePort });
  const initialIntent = loadIntent(process.env);
  await intentState.apply(initialIntent);
  const args = mariaDbArguments({ ...config, intentConfigPath: intentState.paths.renderedPath });
  mariaProcess = createMariaDbProcess({ args, log, onUnexpectedExit: (code) => { if (!restarting && !shuttingDown) process.exit(code ?? 1); } });
  applyIntent = async (desired) => { const active = loadIntent(process.env); const plan = planIntent(desired, active); if (plan.change === 'unsafe') throw Object.assign(new Error(plan.reason), { statusCode: 409, code: 'UNSAFE_INTENT_CHANGE' }); const result = await intentState.apply(desired); if (plan.change === 'reload') mariaProcess.child?.kill('SIGHUP'); if (plan.change === 'restart') { restarting = true; try { await mariaProcess.stop(config.timeoutMs); await mariaProcess.start(args); } finally { restarting = false; } } return result; };
  mariaProcess.start().catch((error) => { log.error('Failed to start mariadbd', { error }); void signals.shutdown('mariadbd-error'); });
  bootstrapMaria = createEleraBootstrap({ processController: mariaProcess, args, health, timeoutMs: config.timeoutMs, log, isBusy: () => restarting, setBusy: (value) => { restarting = value; } });
  db = await createDbFromEnvironment({ env: dbEnv, log });
  probes.listen(config.httpPort, '0.0.0.0', () => log.info('HTTP listener started', { port: config.httpPort }));
  if (!await waitForSql({ health, timeoutMs: config.startupTimeoutMs, log })) throw new Error(`MariaDB did not become SQL-ready within ${config.startupTimeoutMs}ms`);
  const peers = (process.env.ELERA_PEERS ?? '').split(',').map((value) => value.trim()).filter(Boolean);
  if (peers.length) { const peerClient = createPeerObservationClient({ peers, token: process.env.ELERA_PEER_TOKEN ?? process.env.ROOT_TOKEN, store: observationStore, log }); const publish = async () => { const current = await health.status().catch(() => ({ ready: false, values: {} })); await peerClient.publish({ nodeId: process.env.ELERA_NODE_NAME ?? 'elera', clusterId: process.env.ELERA_CLUSTER_NAME ?? 'local-elera', state: current.values?.wsrep_local_state_comment ?? (current.ready ? 'Ready' : 'Down'), synced: current.values?.wsrep_local_state_comment === 'Synced', primary: current.values?.wsrep_cluster_status ?? 'Unknown', health: current.ready ? 'ok' : 'not-ready', load: current.values ?? {}, drain: drained, observedAt: Date.now() }); await peerClient.refresh(); }; peerTimer = setInterval(() => { void publish(); }, 1000); void publish(); }
  servers.push(listenAgent({ port: config.agentPort, performance: false, timeoutMs: config.timeoutMs, getStatus: () => health.status(), isDrained: () => drained, log }));
  servers.push(listenAgent({ port: config.performancePort, performance: true, timeoutMs: config.timeoutMs, getStatus: () => health.status(), isDrained: () => drained, log }));
  log.info('Elera supervisor started');
}
main().catch((error) => { log.error('Supervisor startup failed', { error }); void signals.shutdown('startup-failure').then(() => process.exit(1)); });
