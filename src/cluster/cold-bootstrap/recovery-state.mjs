const STATES = new Set([
  'pending', 'collecting-evidence', 'awaiting-quorum', 'recovery-authorized',
  'bootstrapping', 'joining', 'cluster-unavailable', 'blocked-ambiguous',
]);

export function createRecoveryState(initial = 'pending') {
  if (!STATES.has(initial)) throw new TypeError(`invalid recovery state: ${initial}`);
  let state = initial;
  let reason;
  let epoch;
  return {
    set(next, details = {}) {
      if (!STATES.has(next)) throw new TypeError(`invalid recovery state: ${next}`);
      state = next; reason = details.reason; epoch = details.epoch;
      return this.snapshot();
    },
    get() { return state; },
    snapshot() { return { state, ...(reason ? { reason } : {}), ...(epoch ? { epoch } : {}) }; },
  };
}

export { STATES as RECOVERY_STATES };
