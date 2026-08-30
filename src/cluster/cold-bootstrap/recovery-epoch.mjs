import { createHash } from 'node:crypto';

const phases = new Set(['evidence', 'authorized', 'bootstrapping', 'complete', 'blocked']);
const transitions = new Map([
  ['evidence', new Set(['authorized', 'blocked'])],
  ['authorized', new Set(['bootstrapping', 'blocked'])],
  ['bootstrapping', new Set(['complete', 'blocked'])],
  ['complete', new Set()],
  ['blocked', new Set(['evidence'])],
]);
export function createRecoveryEpoch({ clusterId, evidence, winner, quorum, now = new Date() } = {}) {
  if (!clusterId || !winner?.node || !Number.isInteger(winner.seqno) || !Array.isArray(evidence) || !Array.isArray(quorum) || quorum.length === 0) throw new TypeError('complete recovery epoch data is required');
  const canonicalEvidence = evidence.toSorted((a, b) => String(a.node).localeCompare(String(b.node))).map(({ node, uuid, seqno, savedSeqno, recoveredSeqno, safeToBootstrap, dataDirectory, galera, generation, active }) => ({ node, uuid, seqno, savedSeqno, recoveredSeqno, safeToBootstrap: Boolean(safeToBootstrap), dataDirectory, galera, generation, active: Boolean(active) }));
  const digest = createHash('sha256').update(JSON.stringify(canonicalEvidence)).digest('hex');
  return { version: 1, epoch: `${clusterId}:${digest}`, clusterId, evidenceDigest: digest, winner: { node: winner.node, uuid: winner.uuid, seqno: winner.seqno }, quorum: [...new Set(quorum)].sort(), phase: 'evidence', createdAt: new Date(now).toISOString() };
}
export function transitionRecoveryEpoch(epoch, phase, details = {}) {
  if (!epoch || !phases.has(phase)) throw new TypeError('valid recovery epoch and phase are required');
  if (phase !== epoch.phase && !transitions.get(epoch.phase)?.has(phase)) throw Object.assign(new Error(`invalid recovery epoch transition: ${epoch.phase} -> ${phase}`), { code: 'INVALID_RECOVERY_EPOCH_TRANSITION' });
  if (phase === 'authorized') {
    if (!Array.isArray(details.acknowledgements)) throw new Error('recovery epoch requires identified quorum acknowledgements');
    const acknowledgements = new Set(details.acknowledgements);
    const members = new Set(epoch.quorum);
    if (acknowledgements.size < Math.floor(epoch.quorum.length / 2) + 1) throw new Error('recovery epoch lacks quorum authorization');
    if ([...acknowledgements].some((node) => !members.has(node))) throw new Error('recovery epoch contains an unknown quorum member');
    if (acknowledgements.size !== details.acknowledgements.length) throw new Error('recovery epoch contains duplicate quorum acknowledgements');
    return { ...epoch, ...details, acknowledgements, phase, updatedAt: new Date().toISOString() };
  }
  if (phase === 'complete' && details.clusterId !== epoch.clusterId) throw new Error('recovery completion cluster identity mismatch');
  if (phase === 'complete' && details.winner !== epoch.winner.node) throw new Error('recovery completion winner mismatch');
  return { ...epoch, ...details, phase, updatedAt: new Date().toISOString() };
}
export function validateRecoveryEpoch(epoch, expectedClusterId) {
  if (!epoch || epoch.version !== 1 || epoch.clusterId !== expectedClusterId || !epoch.evidenceDigest || !epoch.winner?.node || !Array.isArray(epoch.quorum) || epoch.phase === 'blocked') return false;
  return epoch.epoch === `${epoch.clusterId}:${epoch.evidenceDigest}`;
}
