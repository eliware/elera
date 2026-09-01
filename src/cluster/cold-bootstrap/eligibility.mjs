import { recoverState } from './recovery.mjs';
import { selectCandidate } from './candidate.mjs';

const isFqdn = (value) => typeof value === 'string' && value.includes('.') && value.split('.').every((label) => /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?$/.test(label));

export async function evaluateColdBootstrap(nodes, { readState, recover = recoverState, isOnline = async () => false } = {}) {
  if (!Array.isArray(nodes) || nodes.length === 0) throw new TypeError('cluster nodes are required');
  if (nodes.some((node) => !isFqdn(node?.name)) || new Set(nodes.map((node) => node.name)).size !== nodes.length) throw new TypeError('cluster nodes require unique FQDN identities');
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
