import { recoverState } from './recovery.mjs';

export function createStartupLocalEvidence({ node, dataDir, readState, runRecover, isActive = () => false, inspect = () => ({ action: 'start', reason: 'state-readable' }) } = {}) {
  if (!node?.name || !dataDir || typeof readState !== 'function' || typeof runRecover !== 'function' || typeof isActive !== 'function') throw new TypeError('startup local evidence dependencies are required');
  let recoveredState;
  let recoveryInFlight;
  let generation = 0;
  return async function readEvidence() {
    generation += 1;
    const state = await readState(dataDir);
    const directory = inspect(dataDir);
    const observedAt = new Date().toISOString();
    if (state.seqno >= 0 || isActive()) return { node: node.name, state: { ...state, savedSeqno: state.seqno, recoveredSeqno: undefined }, dataDirectory: { valid: directory.action === 'start', reason: directory.reason }, active: isActive(), generation, observedAt };
    if (!recoveredState) {
      recoveryInFlight ??= recoverState(dataDir, { run: runRecover }).then((value) => {
        recoveredState = value;
        return value;
      }).finally(() => { recoveryInFlight = undefined; });
    }
    const recovered = recoveredState ?? await recoveryInFlight;
    return { node: node.name, state: { ...state, ...recovered, savedSeqno: state.seqno, recoveredSeqno: recovered.seqno }, dataDirectory: { valid: directory.action === 'start', reason: directory.reason }, active: false, generation, observedAt };
  };
}
