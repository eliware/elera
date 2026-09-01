import { waitForSql } from '../lifecycle/startup.mjs';
import { verifySupervisorJoin } from './join-verification.mjs';

export async function startSupervisorReadiness({ probes, config, health, log, join, startupDecision, initialIntent, recoveryState, recoveryAudit, identity } = {}) {
  if (!probes || typeof (probes.start ?? probes.listen) !== 'function' || !config?.httpPort || !config.startupTimeoutMs || typeof health?.status !== 'function' || typeof log?.info !== 'function' || !identity?.name || !identity.name.includes('.') || !initialIntent?.cluster?.members?.length) throw new TypeError('startup readiness requires listener, health, intent, and shared FQDN identity');
  // Keep the supervisor reachable while MariaDB/Galera is starting. The
  // readiness endpoint must report 503 during this interval, but callers must
  // not see connection failures caused by a listener that starts too late.
  await (probes.start ?? probes.listen)(config.httpPort, '0.0.0.0', () => log.info('HTTP listener started', { port: config.httpPort }));
  const sqlReady = await waitForSql({ health, timeoutMs: config.startupTimeoutMs, log });
  if (!sqlReady) log.warn('MariaDB is not SQL-ready; supervisor remains available for explicit recovery', { timeoutMs: config.startupTimeoutMs });
  if (join && sqlReady) await verifySupervisorJoin({ elera: config.elera, mode: startupDecision.mode, sqlReady, health, startupDecision, expectedSize: initialIntent.cluster.members.length, recoveryState, recoveryAudit, node: identity.name });
  return sqlReady;
}
