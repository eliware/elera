import { createRecoveryJoinClient } from './recovery-join-client.mjs';
import { recoverJoinersSequentially } from './sequential-joiners.mjs';

export function createSupervisorRecoveryJoiner({ identity, token, timeoutMs, httpPort = 8080, recoveryState, recoveryAudit, publishRecovery = async () => {}, log, fetchImpl = fetch } = {}) {
  const client = createRecoveryJoinClient({ token, timeoutMs, fetchImpl });
  return ({ bootstrap, members = [] } = {}) => {
    const winner = members.find((member) => member.name === identity.name);
    return recoverJoinersSequentially({
      joiners: members.filter((member) => member.name !== identity.name),
      startJoiner: (joiner) => client.join({ ...joiner, url: joiner.url ?? `http://${joiner.address}:${httpPort}`, winnerAddress: winner?.address, epoch: bootstrap?.epoch, clusterId: bootstrap?.clusterId, quorum: bootstrap?.quorum ?? members.map((member) => member.name) }),
      verifyJoiner: async (joiner) => ({ valid: true, node: joiner.name }),
      recoveryState, recoveryAudit, publishRecovery, log,
    });
  };
}
