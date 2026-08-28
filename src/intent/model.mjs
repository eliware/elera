import { runtimeIdentity } from '../runtime/identity.mjs';
import { createHash } from 'node:crypto';

export function validateIntent(intent) {
  const errors = [];
  if (!intent || intent.apiVersion !== 'elera.eliware.dev/v1alpha1') errors.push('apiVersion must be elera.eliware.dev/v1alpha1');
  if (intent?.kind !== 'SupervisorIntent') errors.push('kind must be SupervisorIntent');
  if (!intent?.cluster?.name || !Array.isArray(intent.cluster.members) || intent.cluster.members.length === 0) errors.push('cluster.name and at least one cluster member are required');
  if (!Number.isInteger(intent?.mariadb?.port) || intent.mariadb.port < 1 || intent.mariadb.port > 65535) errors.push('mariadb.port must be a valid TCP port');
  if (!Number.isInteger(intent?.routing?.healthIntervalMs) || intent.routing.healthIntervalMs < 100) errors.push('routing.healthIntervalMs must be at least 100');
  if (!Number.isInteger(intent?.drain?.queryTimeoutMs) || intent.drain.queryTimeoutMs < 1) errors.push('drain.queryTimeoutMs is required');
  if (errors.length) throw Object.assign(new Error(`invalid supervisor intent: ${errors.join('; ')}`), { statusCode: 400, code: 'INVALID_INTENT', details: errors });
  return structuredClone(intent);
}

export function intentHash(intent) { return createHash('sha256').update(JSON.stringify(intent)).digest('hex'); }

export function planIntent(desired, active) {
  validateIntent(desired);
  if (!active) return { change: 'restart', changed: true, desiredHash: intentHash(desired), activeHash: null };
  const desiredHash = intentHash(desired); const activeHash = intentHash(active);
  if (desiredHash === activeHash) return { change: 'no-op', changed: false, desiredHash, activeHash };
  if (desired.cluster.name !== active.cluster.name || JSON.stringify(desired.cluster.members) !== JSON.stringify(active.cluster.members)) return { change: 'unsafe', changed: true, desiredHash, activeHash, reason: 'cluster identity or membership changes require an explicit bootstrap workflow' };
  if (desired.mariadb.port !== active.mariadb.port) return { change: 'restart', changed: true, desiredHash, activeHash };
  return { change: 'reload', changed: true, desiredHash, activeHash };
}

export function defaultIntent(environment = process.env) {
  const identity = runtimeIdentity();
  const host = identity.address;
  const name = identity.name;
  return { apiVersion: 'elera.eliware.dev/v1alpha1', kind: 'SupervisorIntent', cluster: { name: 'local-elera', members: [{ name, address: host, port: 3306 }] }, mariadb: { port: 3306, dataDir: environment.MARIADB_DATA_DIR ?? '/var/lib/mysql', binlogFormat: 'ROW' }, routing: { healthIntervalMs: 1000, weights: {} }, drain: { queryTimeoutMs: Number(environment.ELERA_QUERY_TIMEOUT_MS ?? 5000), drainTimeoutMs: Number(environment.ELERA_DRAIN_TIMEOUT_MS ?? 45000), shutdownTimeoutMs: Number(environment.ELERA_SHUTDOWN_TIMEOUT_MS ?? 60000) } };
}

export function loadIntent(environment = process.env) {
  if (!environment.SUPERVISOR_INTENT_JSON) return validateIntent(defaultIntent(environment));
  try { return validateIntent(JSON.parse(environment.SUPERVISOR_INTENT_JSON)); } catch (error) { if (error.code === 'INVALID_INTENT') throw error; throw Object.assign(new Error(`invalid SUPERVISOR_INTENT_JSON: ${error.message}`), { statusCode: 400, code: 'INVALID_INTENT' }); }
}
