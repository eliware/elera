import { createSupervisorColdRecovery } from './cold-recovery-wiring.mjs';
import { createStartupLocalEvidence } from '../cluster/cold-bootstrap/startup-local-evidence.mjs';
import { createStartupEvidenceServer } from '../cluster/cold-bootstrap/startup-evidence-server.mjs';
import { createRecoveryLease } from '../cluster/cold-bootstrap/lease.mjs';
import { readStateFile } from '../cluster/cold-bootstrap/state-file.mjs';
import { inspectDataDirectory } from '../lifecycle/data-directory.mjs';
import { createRecoveryCompletion } from '../cluster/cold-bootstrap/completion.mjs';
import { runWsrepRecover } from './wsrep-recovery.mjs';
import { resolveExplicitSupervisorStartup } from './startup-decision-wiring.mjs';
import { recoveryStartupDecision } from './recovery-startup-decision.mjs';
import { recordSupervisorRecoveryDecision } from './recovery-decision.mjs';
import { authorizeSupervisorRecovery } from './recovery-authorization.mjs';
import { resolveSupervisorRejoin } from './rejoin-decision.mjs';

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
      const markerReader = restartMarker?.read;
      const marker = markerReader ? await markerReader() : await restartMarker?.consume?.();
      if (marker) {
        const attempts = markerReader ? Math.max(1, Math.min(15, Math.ceil((config.startupTimeoutMs ?? 15000) / 1000))) : 1;
        for (let attempt = 0; attempt < attempts && startupDecision.mode !== 'join'; attempt += 1) {
          const evidence = await coldRecoveryProtocol.evidence().catch(() => []);
          const peer = evidence.find((item) => item.node !== identity.name && item.active === true && item.galera?.clusterStatus === 'Primary');
          if (peer) {
            if (restartMarker?.read) await restartMarker.consume({ expectedNonce: marker.nonce });
            startupDecision = { mode: 'join', reason: 'validated clean restart with active Primary peer', epoch: null, bootstrapComplete: true, evidence };
          } else if (attempt + 1 < attempts) await new Promise((resolve) => setTimeout(resolve, 1000));
        }
      }
      if (startupDecision.mode === 'join') return { initialIntent, args, localEvidence, members, coldRecoveryProtocol, startupDecision, recoveryCompletion, startupServer };
      recoveryState.set('collecting-evidence');
      const startupEvidence = createStartupLocalEvidence({ node: identity, dataDir: config.dataDir, readState: (directory) => readStateFile(directory), runRecover: runWsrepRecover, inspect: inspectDataDirectory, isActive: () => Boolean(mariaProcess?.child && mariaProcess.child.exitCode === null) });
      recoveryCompletion = createRecoveryCompletion();
      startupServer = createStartupEvidenceServer({ port: config.httpPort, token: environment.ELERA_PEER_TOKEN ?? environment.ROOT_TOKEN, evidence: startupEvidence, lease: createRecoveryLease('/run/elera/cold-recovery.lease'), completion: recoveryCompletion, log });
      await startupServer.listen();
      let recoveryPlan;
      const attempts = Math.max(1, Math.min(15, Math.ceil((config.startupTimeoutMs ?? 15000) / 1000)));
      for (let attempt = 0; attempt < attempts; attempt += 1) {
        recoveryPlan = await coldRecoveryProtocol.plan();
        if (recoveryPlan.mode !== 'blocked' || attempt + 1 >= attempts) break;
        await new Promise((resolve) => setTimeout(resolve, 1000));
        await coldRecoveryProtocol.retry();
      }
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
