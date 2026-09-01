import { verifyJoinedMember } from '../cluster/cold-bootstrap/join-verification.mjs';

export function verifySupervisorJoin({ elera, mode, sqlReady, health, startupDecision, expectedSize, recoveryState, recoveryAudit, node } = {}) {
  if (!(elera && ['join', 'rejoin'].includes(mode) && sqlReady)) return false;
  return health.status().then((joined) => {
    const valid = verifyJoinedMember({ values: joined.values, expectedClusterId: startupDecision.recoveryEpoch?.clusterId ?? joined.values?.wsrep_cluster_state_uuid, minimumSize: 2 }).valid;
    if (valid) recoveryState.set('complete', { reason: 'joined Primary cluster', epoch: startupDecision.epoch });
    if (valid) recoveryAudit.joinComplete({ node, epoch: startupDecision.epoch });
    else recoveryAudit.failure({ reason: 'join did not reach expected Synced Primary membership', epoch: startupDecision.epoch });
    return valid;
  });
}
