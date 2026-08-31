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

export async function prepareSupervisorRecovery({ startupConfiguration, intentState, config, identity, health, recoveryState, recoveryAudit, log, mariaProcess, environment = process.env, restartMarker } = {}) {
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
      startupDecision = await resolveCleanRestart({ restartMarker, recoveryProtocol: coldRecoveryProtocol, identity, startupTimeoutMs: config.startupTimeoutMs ?? 15000 }) ?? startupDecision;
      if (startupDecision.mode === 'join') return { initialIntent, args, localEvidence, members, coldRecoveryProtocol, startupDecision, recoveryCompletion, startupServer };
      recoveryState.set('collecting-evidence');
      const evidenceService = createRecoveryEvidenceService({ identity, dataDir: config.dataDir, httpPort: config.httpPort, token: environment.ELERA_PEER_TOKEN ?? environment.ROOT_TOKEN, mariaProcess, log });
      const startupEvidence = evidenceService.evidence;
      recoveryCompletion = evidenceService.completion;
      startupServer = evidenceService.server;
      await startupServer.listen();
      const recoveryPlan = await resolveRecoveryPlan({ recoveryProtocol: coldRecoveryProtocol, startupTimeoutMs: config.startupTimeoutMs ?? 15000 });
      startupDecision = recoveryStartupDecision(recoveryPlan, identity.name);
      await recordSupervisorRecoveryDecision({ decision: startupDecision, recoveryState, recoveryAudit, environment });
      const authorized = await authorizeSupervisorRecovery({ decision: startupDecision, members, config, intentState, recoveryProtocol: coldRecoveryProtocol, recoveryState, recoveryAudit, log });
      startupDecision = authorized.decision;
      if (authorized.args) args = authorized.args;
      startupDecision = await resolveSupervisorRejoin({ decision: startupDecision, members, config, environment, recoveryState });
      if (!(startupDecision.mode === 'bootstrap' && startupDecision.localWinner === true)) await startupServer.close();
    }
  }
  return { initialIntent, args, localEvidence, members, coldRecoveryProtocol, startupDecision, recoveryCompletion, startupServer };
}
