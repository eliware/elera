import { createColdBootstrapEvidence } from '../cluster/cold-bootstrap/peer-evidence.mjs';
import { createColdRecoveryProtocol } from '../cluster/cold-bootstrap/protocol.mjs';
import { createRecoveryDecisionStore } from '../cluster/cold-bootstrap/decision-store.mjs';

export function createSupervisorColdRecovery({ identity, config, health, runRecover, recoveryAudit, log, environment = process.env, createEvidence = createColdBootstrapEvidence, createProtocol = createColdRecoveryProtocol, createStore = createRecoveryDecisionStore } = {}) {
  const evidence = createEvidence({ localNode: identity, dataDir: config.dataDir, health, token: environment.ROOT_TOKEN, read: undefined, run: runRecover, log });
  const members = (config.members ?? []).map((member) => ({ ...member, local: member.name === identity.name, url: `http://${member.address}:${config.httpPort}` }));
  const protocol = createProtocol({
    nodes: members,
    localEvidence: evidence.local,
    fetchEvidence: evidence.remote,
    store: createStore(environment.ELERA_RECOVERY_DECISION_PATH ?? '/run/elera/cold-recovery.json'),
    publishEvent: async (event) => recoveryAudit.event(event),
  });
  return { evidence, members, protocol };
}
