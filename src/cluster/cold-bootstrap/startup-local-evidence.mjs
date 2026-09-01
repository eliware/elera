import { recoverState } from './recovery.mjs';

const isFqdn = (value) => typeof value === 'string' && value.includes('.') && value.split('.').every((label) => /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?$/.test(label));

export function createStartupLocalEvidence({ node, dataDir, readState, runRecover, isActive = () => false, inspect = () => ({ action: 'start', reason: 'state-readable' }) } = {}) {
  if (!isFqdn(node?.name) || !dataDir || typeof readState !== 'function' || typeof runRecover !== 'function' || typeof isActive !== 'function') throw new TypeError('startup local evidence dependencies require a FQDN identity');
  let recoveredState;
  let recoveryFailure;
  let recoveryInFlight;
  let generation = 0;
  return async function readEvidence() {
    generation += 1;
    const state = await readState(dataDir);
    const directory = inspect(dataDir);
    const observedAt = new Date().toISOString();
    const active = isActive();
    if (state.seqno >= 0 || active) return { node: node.name, state: { ...state, savedSeqno: state.seqno, recoveredSeqno: undefined }, dataDirectory: { valid: directory.action === 'start', reason: directory.reason }, active, generation, observedAt };
    if (recoveryFailure) throw recoveryFailure;
    if (!recoveredState) {
      recoveryInFlight ??= recoverState(dataDir, { run: runRecover }).then((value) => {
        recoveredState = value;
        return value;
      }).catch((error) => {
        recoveryFailure = error;
        throw error;
      }).finally(() => { recoveryInFlight = undefined; });
    }
    const recovered = recoveredState ?? await recoveryInFlight;
    return { node: node.name, state: { ...state, ...recovered, savedSeqno: state.seqno, recoveredSeqno: recovered.seqno }, dataDirectory: { valid: directory.action === 'start', reason: directory.reason }, active: false, generation, observedAt };
  };
}
