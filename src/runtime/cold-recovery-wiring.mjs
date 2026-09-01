import { createColdBootstrapEvidence } from '../cluster/cold-bootstrap/peer-evidence.mjs';
import { createColdRecoveryProtocol } from '../cluster/cold-bootstrap/protocol.mjs';
import { createRecoveryDecisionStore } from '../cluster/cold-bootstrap/decision-store.mjs';

export function createSupervisorColdRecovery({ identity, config, health, runRecover, recoveryAudit, log, environment = process.env, createEvidence = createColdBootstrapEvidence, createProtocol = createColdRecoveryProtocol, createStore = createRecoveryDecisionStore } = {}) {
  if (!identity?.name || !identity.name.includes('.')) throw new TypeError('runtime identity must be a fully qualified hostname for cold recovery');
  if (!health || typeof runRecover !== 'function' || typeof recoveryAudit?.event !== 'function') throw new TypeError('cold recovery health, recovery, and audit dependencies are required');
  const configuredMembers = config.intent?.cluster?.members;
  if (!Array.isArray(configuredMembers) || configuredMembers.length === 0 || configuredMembers.some((member) => !member?.name?.includes('.') || !member.address?.includes('.'))) throw new TypeError('configured cold recovery members must use FQDN identities and addresses');
  const evidence = createEvidence({ localNode: identity, dataDir: config.dataDir, health, token: environment.ROOT_TOKEN, read: undefined, run: runRecover, log });
  const members = configuredMembers.map((member) => {
    const url = member.url ?? `http://${member.address}:${config.httpPort}`;
    const parsed = new URL(url);
    if (parsed.hostname !== member.address) throw new Error(`configured recovery URL ${url} does not match member address ${member.address}`);
    return { ...member, local: member.name === identity.name, url };
  });
  if (members.filter((member) => member.local).length !== 1) throw new Error(`runtime hostname ${identity.name} must match exactly one configured cluster member`);
  const protocol = createProtocol({
    nodes: members,
    localEvidence: evidence.local,
    fetchEvidence: evidence.remote,
    store: createStore(environment.ELERA_RECOVERY_DECISION_PATH ?? '/run/elera/cold-recovery.json'),
    log,
    publishEvent: async (event) => recoveryAudit.event(event),
  });
  return { evidence, members, protocol };
}
