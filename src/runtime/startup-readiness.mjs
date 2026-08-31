import { waitForSql } from '../lifecycle/startup.mjs';
import { verifySupervisorJoin } from './join-verification.mjs';

export async function startSupervisorReadiness({ probes, config, health, log, join, startupDecision, initialIntent, recoveryState, recoveryAudit, identity } = {}) {
  const sqlReady = await waitForSql({ health, timeoutMs: config.startupTimeoutMs, log });
  if (!sqlReady) log.warn('MariaDB is not SQL-ready; supervisor remains available for explicit recovery', { timeoutMs: config.startupTimeoutMs });
  if (join && sqlReady) await verifySupervisorJoin({ elera: config.elera, mode: startupDecision.mode, sqlReady, health, startupDecision, expectedSize: initialIntent.cluster.members.length, recoveryState, recoveryAudit, node: identity.name });
  probes.listen(config.httpPort, '0.0.0.0', () => log.info('HTTP listener started', { port: config.httpPort }));
  return sqlReady;
}
