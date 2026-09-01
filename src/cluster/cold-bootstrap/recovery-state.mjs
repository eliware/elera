const STATES = new Set([
  'pending', 'collecting-evidence', 'awaiting-quorum', 'recovery-authorized',
  'bootstrapping', 'joining', 'complete', 'cluster-unavailable', 'blocked-ambiguous',
]);
const TRANSITIONS = new Map([
  ['pending', new Set(['collecting-evidence', 'joining', 'bootstrapping', 'cluster-unavailable', 'blocked-ambiguous'])],
  ['collecting-evidence', new Set(['awaiting-quorum', 'joining', 'blocked-ambiguous', 'cluster-unavailable'])],
  ['awaiting-quorum', new Set(['recovery-authorized', 'blocked-ambiguous', 'cluster-unavailable'])],
  ['recovery-authorized', new Set(['bootstrapping', 'blocked-ambiguous', 'cluster-unavailable'])],
  ['bootstrapping', new Set(['joining', 'complete', 'cluster-unavailable'])],
  ['joining', new Set(['joining', 'complete', 'cluster-unavailable'])],
  ['complete', new Set(['collecting-evidence', 'cluster-unavailable'])],
  ['cluster-unavailable', new Set(['collecting-evidence', 'blocked-ambiguous', 'complete', 'joining'])],
  // A previously blocked recovery may become a normal Galera rejoin when
  // persisted peers return and the component reforms without bootstrap.
  ['blocked-ambiguous', new Set(['collecting-evidence', 'joining'])],
]);

export function createRecoveryState(initial = 'pending') {
  if (!STATES.has(initial)) throw new TypeError(`invalid recovery state: ${initial}`);
  let state = initial;
  let reason;
  let epoch;
  let context = {};
  const isStaleEpoch = (candidate) => {
    if (candidate === undefined || epoch === undefined) return false;
    if (candidate === epoch) return false;
    if (typeof candidate === 'number' && typeof epoch === 'number') return candidate < epoch;
    return String(candidate) < String(epoch);
  };
  return {
    set(next, details = {}) {
      if (!STATES.has(next)) throw new TypeError(`invalid recovery state: ${next}`);
      if (isStaleEpoch(details.epoch)) return this.snapshot();
      if (state === 'complete' && next === 'cluster-unavailable' && details.epoch === epoch) return this.snapshot();
      if (next !== state && !TRANSITIONS.get(state)?.has(next)) throw Object.assign(new Error(`invalid recovery transition: ${state} -> ${next}`), { code: 'INVALID_RECOVERY_TRANSITION' });
      state = next; reason = details.reason; epoch = details.epoch ?? epoch;
      context = { ...details };
      return this.snapshot();
    },
    get() { return state; },
    snapshot() { return { state, ...context, ...(reason ? { reason } : {}), ...(epoch !== undefined ? { epoch } : {}) }; },
  };
}

export { STATES as RECOVERY_STATES };
export { TRANSITIONS as RECOVERY_TRANSITIONS };
