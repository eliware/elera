import { recoverState } from './recovery.mjs';
import { selectCandidate } from './candidate.mjs';

export async function evaluateColdBootstrap(nodes, { readState, recover = recoverState, isOnline = async () => false } = {}) {
  if (!Array.isArray(nodes) || nodes.length === 0) throw new TypeError('cluster nodes are required');
  if (typeof readState !== 'function' || typeof recover !== 'function' || typeof isOnline !== 'function') throw new TypeError('cold bootstrap evidence readers are required');
  const states = [];
  for (const node of nodes) {
    try {
      if (await isOnline(node)) return { eligible: false, reason: `node is still online: ${node.name}`, candidates: states };
      const state = await readState(node);
      states.push(state.seqno >= 0 ? { ...state, node: node.name } : { ...await recover(node.dataDir), node: node.name, safeToBootstrap: state.safeToBootstrap });
    } catch (error) {
      return { eligible: false, reason: `node evidence unavailable: ${node.name}`, error: error.message, candidates: states };
    }
  }
  return selectCandidate(states);
}
