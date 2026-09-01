import { createSupervisorColdRecovery } from './cold-recovery-wiring.mjs';
import { runWsrepRecover } from './wsrep-recovery.mjs';
import { resolveExplicitSupervisorStartup } from './startup-decision-wiring.mjs';
import { recoveryStartupDecision } from './recovery-startup-decision.mjs';
import { recordSupervisorRecoveryDecision } from './recovery-decision.mjs';
import { authorizeSupervisorRecovery } from './recovery-authorization.mjs';
import { resolveSupervisorRejoin } from './rejoin-decision.mjs';
import { resolveCleanRestart } from './clean-restart-recovery.mjs';
import { resolveRecoveryPlan } from './recovery-plan-retry.mjs';
import { createRecoveryEvidenceService } from './recovery-evidence-service.mjs';
import { inspectDataDirectory } from '../lifecycle/data-directory.mjs';

const replacementOrCurrent = (current, replacement = current) => replacement;

export async function prepareSupervisorRecovery({ startupConfiguration, intentState, config, identity, health, recoveryState, recoveryAudit, log, mariaProcess, getMariaProcess = () => mariaProcess?.mariaProcess ?? mariaProcess, environment = process.env, restartMarker, probes } = {}) {
  log.debug?.('Recovery phase: preparing startup decision', { node: identity.name, clusterMode: config.elera, dataDir: config.dataDir });
  const initialIntent = startupConfiguration.initialIntent;
  let args = startupConfiguration.args;
  const coldRecovery = createSupervisorColdRecovery({ identity, config: { ...config, members: initialIntent.cluster.members }, health, runRecover: runWsrepRecover, recoveryAudit, log, environment });
  const localEvidence = coldRecovery.evidence;
  const members = coldRecovery.members;
  const coldRecoveryProtocol = coldRecovery.protocol;
  let startupDecision = { mode: 'standalone', reason: 'single-node configuration' };
  let recoveryCompletion;
  let startupServer;
  if (config.elera) {
    const bootstrapMember = initialIntent.cluster.members[0];
    const explicitStartup = await resolveExplicitSupervisorStartup({ environment, nodeName: identity.name, dataDir: config.dataDir, args, joinAddress: bootstrapMember?.address });
    if (explicitStartup.explicit) { startupDecision = explicitStartup.decision; args = explicitStartup.args; }
    else {
      // Make this supervisor observable before any peer probes run. Cold-start
      // discovery must tolerate different MariaDB startup times without turning
      // a listener race into missing quorum evidence.
      recoveryState.set('collecting-evidence');
      const setStartupHandler = probes && probes.setStartupHandler;
      const unifiedListener = typeof setStartupHandler === 'function';
      const evidenceOptions = { identity, dataDir: config.dataDir, httpPort: config.httpPort, token: environment.ELERA_PEER_TOKEN ?? environment.ROOT_TOKEN, mariaProcess, getMariaProcess, log };
      if (unifiedListener) evidenceOptions.createServer = null;
      const evidenceService = createRecoveryEvidenceService(evidenceOptions);
      const startupEvidence = evidenceService.evidence;
      recoveryCompletion = evidenceService.completion;
      startupServer = evidenceService.server;
      if (unifiedListener) setStartupHandler(evidenceService.routes);
      if (!unifiedListener) await startupServer.listen();
      log.debug?.('Recovery phase: evidence routes mounted', { node: identity.name, port: config.httpPort, unified: Boolean(probes?.setStartupHandler) });
      startupDecision = await resolveCleanRestart({ restartMarker, recoveryProtocol: coldRecoveryProtocol, identity, startupTimeoutMs: config.startupTimeoutMs ?? 15000, log }) ?? startupDecision;
      log.debug?.('Recovery phase: clean-restart decision evaluated', { node: identity.name, mode: startupDecision.mode, reason: startupDecision.reason });
      if (startupDecision.mode === 'join') { if (!unifiedListener) await startupServer.close(); return { initialIntent, args, localEvidence, members, coldRecoveryProtocol, startupDecision, recoveryCompletion, startupServer }; }
      const recoveryPlan = await resolveRecoveryPlan({ recoveryProtocol: coldRecoveryProtocol, startupTimeoutMs: config.startupTimeoutMs ?? 15000 });
      log.debug?.('Recovery phase: recovery plan resolved', { node: identity.name, mode: recoveryPlan.mode, winner: recoveryPlan.winner?.node });
      startupDecision = recoveryStartupDecision(recoveryPlan, identity.name);
      await recordSupervisorRecoveryDecision({ decision: startupDecision, recoveryState, recoveryAudit, environment });
      const authorized = await authorizeSupervisorRecovery({ decision: startupDecision, members, config, intentState, recoveryProtocol: coldRecoveryProtocol, recoveryState, recoveryAudit, log });
      startupDecision = authorized.decision;
      args = replacementOrCurrent(args, authorized.args);
      startupDecision = await resolveSupervisorRejoin({ decision: startupDecision, members, config, environment, recoveryState });
      // A blocked cold-recovery plan must not prevent an initialized member
      // from starting MariaDB normally and allowing Galera to re-form quorum.
      // Bootstrap remains blocked; only ordinary wsrep reconnect is allowed.
      if (startupDecision.mode === 'blocked' && inspectDataDirectory(config.dataDir).action === 'start') {
        startupDecision = { ...startupDecision, mode: 'rejoin', bootstrapComplete: true, reason: `normal Galera rejoin permitted: ${startupDecision.reason}` };
      }
      log.debug?.('Recovery phase: rejoin decision resolved', { node: identity.name, mode: startupDecision.mode, localWinner: startupDecision.localWinner });
      if (!unifiedListener && !(startupDecision.mode === 'bootstrap' && startupDecision.localWinner === true)) await startupServer.close();
    }
  }
  return { initialIntent, args, localEvidence, members, coldRecoveryProtocol, startupDecision, recoveryCompletion, startupServer };
}
