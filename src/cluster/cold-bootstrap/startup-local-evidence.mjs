import { recoverState } from './recovery.mjs';

export function createStartupLocalEvidence({ node, dataDir, readState, runRecover } = {}) {
  if (!node?.name || !dataDir || typeof readState !== 'function' || typeof runRecover !== 'function') throw new TypeError('startup local evidence dependencies are required');
  return async function readEvidence() {
    const state = await readState(dataDir);
    const recovered = state.seqno < 0 ? await recoverState(dataDir, { run: runRecover }) : undefined;
    return { node: node.name, state: recovered ? { ...state, ...recovered } : state, active: false };
  };
}
