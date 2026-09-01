import { createRecoveryJoinClient } from './recovery-join-client.mjs';
import { recoverJoinersSequentially } from './sequential-joiners.mjs';
import { verifyJoinedMember } from '../cluster/cold-bootstrap/join-verification.mjs';

export function createSupervisorRecoveryJoiner({ identity, token, timeoutMs, httpPort = 8080, recoveryState, recoveryAudit, publishRecovery = async () => {}, log, fetchImpl = fetch } = {}) {
  const client = createRecoveryJoinClient({ token, timeoutMs, fetchImpl });
  return ({ bootstrap, members = [] } = {}) => {
    const winner = members.find((member) => member.name === identity.name);
    const verifyJoiner = async (joiner) => {
      const url = (joiner.url ?? `http://${joiner.address}:${httpPort}`).replace(/\/$/, '');
      const response = await fetchImpl(`${url}/api/v1/cluster/status`, {
        headers: { accept: 'application/json', authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(timeoutMs),
      });
      let body;
      try { body = await response.json(); } catch { body = {}; }
      if (!response.ok || body.ok === false) return { valid: false, node: joiner.name, reason: body.error ?? `cluster status returned ${response.status}` };
      return { ...verifyJoinedMember({ values: body.data?.values ?? body.data ?? {}, expectedClusterId: bootstrap?.clusterId, expectedSize: members.length }), node: joiner.name };
    };
    return recoverJoinersSequentially({
      joiners: members.filter((member) => member.name !== identity.name),
      startJoiner: (joiner) => client.join({ ...joiner, url: joiner.url ?? `http://${joiner.address}:${httpPort}`, winnerAddress: winner?.address, epoch: bootstrap?.epoch, clusterId: bootstrap?.clusterId, quorum: bootstrap?.quorum ?? members.map((member) => member.name) }),
      verifyJoiner,
      recoveryState, recoveryAudit, publishRecovery, log,
    });
  };
}
