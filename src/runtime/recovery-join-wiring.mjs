import { createRecoveryJoinClient } from './recovery-join-client.mjs';
import { recoverJoinersSequentially } from './sequential-joiners.mjs';
import { verifyJoinedMember } from '../cluster/cold-bootstrap/join-verification.mjs';

export function createSupervisorRecoveryJoiner({ identity, token, timeoutMs, httpPort = 8080, recoveryState, recoveryAudit, publishRecovery = async () => {}, log, fetchImpl = fetch } = {}) {
  if (!identity?.name || !identity.name.includes('.')) throw new TypeError('recovery joiner requires a shared FQDN identity');
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || typeof fetchImpl !== 'function') throw new TypeError('recovery joiner timeout and fetch dependencies are required');
  const client = createRecoveryJoinClient({ token, timeoutMs, fetchImpl });
  return ({ bootstrap, members = [] } = {}) => {
    if (!Array.isArray(members) || members.length < 2 || members.some((member) => !member?.name?.includes('.') || !member.address?.includes('.'))) throw new TypeError('recovery join members must use FQDN identities and addresses');
    const winnerName = typeof bootstrap?.winner === 'string' ? bootstrap.winner : bootstrap?.winner?.node;
    const winner = members.find((member) => member.name === winnerName);
    if (!winner || winner.name === identity.name || !winner.address) throw Object.assign(new Error('recovery join requires a non-local winner with an FQDN address'), { code: 'RECOVERY_JOIN_WINNER_REQUIRED' });
    if (!members.some((member) => member.name === identity.name)) throw new Error(`runtime identity ${identity.name} is not a configured recovery join member`);
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
      epoch: bootstrap?.epoch, recoveryState, recoveryAudit, publishRecovery, log,
    });
  };
}
