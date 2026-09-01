import { selectCandidate } from './candidate.mjs';
import { createRecoveryEpoch } from './recovery-epoch.mjs';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export function createStartupRecoveryDecision({ nodes, expectedNodeCount = nodes?.length, localEvidence, fetchEvidence, attempts = 15, delayMs = 1000, epoch } = {}) {
  const names = nodes?.map((node) => node?.name);
  if (!Array.isArray(nodes) || nodes.length === 0 || !Number.isInteger(expectedNodeCount) || nodes.length !== expectedNodeCount || names.some((name) => !name || !name.includes('.')) || new Set(names).size !== names.length || typeof localEvidence !== 'function' || typeof fetchEvidence !== 'function' || !Number.isInteger(attempts) || attempts < 1 || !Number.isFinite(delayMs) || delayMs < 0) throw new TypeError('startup recovery decision dependencies require a complete FQDN node inventory');
  return async function decide() {
    let lastError;
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      try {
        const results = await Promise.allSettled(nodes.map(async (node) => node.local ? localEvidence() : fetchEvidence(node)));
        const states = results.flatMap((result, index) => result.status === 'fulfilled' ? [result.value].map((value) => {
          const state = value?.state ?? value;
          const actualNode = value?.node ?? state?.node;
          if (actualNode !== nodes[index].name) {
            throw Object.assign(new Error(`recovery evidence identity mismatch: expected ${nodes[index].name}, received ${actualNode ?? 'none'}`), { code: 'RECOVERY_EVIDENCE_IDENTITY_MISMATCH' });
          }
          return { ...state, node: actualNode, dataDirectory: value?.dataDirectory, galera: value?.galera ?? state?.galera, active: value?.active ?? state?.active, generation: value?.generation, observedAt: value?.observedAt };
        }) : []);
        const active = states.some((item) => item.active === true && item.galera?.clusterStatus === 'Primary' && item.galera.localState === 'Synced' && (item.galera.ready === 'ON' || item.galera.ready === true));
        if (active) return { mode: 'join', reason: 'primary component already exists', epoch: null, bootstrapComplete: true, evidence: states };
        const failed = results.find((result) => result.status === 'rejected');
        if (failed) throw failed.reason;
        const decision = selectCandidate(states);
        if (!decision.eligible) return { mode: 'blocked', reason: decision.reason, epoch: null, evidence: states };
        const selected = decision.candidate.node;
        const selectedState = decision.candidate;
        const recoveryEpoch = createRecoveryEpoch({ clusterId: selectedState.uuid, evidence: states, winner: selectedState, quorum: nodes.map((node) => node.name) });
        const epochId = typeof epoch === 'function' ? epoch(states) : recoveryEpoch.epoch;
        return { mode: 'bootstrap', winner: selected, localWinner: selected === nodes.find((node) => node.local)?.name, reason: decision.reason, epoch: epochId, recoveryEpoch: { ...recoveryEpoch, epoch: epochId }, evidence: states };
      } catch (error) {
        lastError = error;
        if (error?.code === 'RECOVERY_EVIDENCE_IDENTITY_MISMATCH') return { mode: 'blocked', reason: error.message, code: error.code, epoch: null, evidence: [] };
      }
      if (attempt + 1 < attempts) await sleep(delayMs);
    }
    return { mode: 'blocked', reason: `recovery evidence unavailable: ${lastError?.message ?? 'timeout'}`, epoch: null, evidence: [] };
  };
}
