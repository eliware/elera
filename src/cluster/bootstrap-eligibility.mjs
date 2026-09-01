const INITIALIZED_STATES = new Set(['Initialized', 'Joining', 'Joined', 'Synced', 'Donor', 'Donor/Desynced', 'Desynced']);

export function bootstrapEligibility({ enabled, ready, state } = {}) {
  if (!enabled) return { eligible: false, reason: 'requires clustered configuration' };
  if (ready) return { eligible: false, reason: 'node is already ready' };
  if (INITIALIZED_STATES.has(state)) return { eligible: false, reason: 'initialized data is not eligible for cold bootstrap' };
  if (state !== 'Offline') return { eligible: false, reason: 'node state is not confirmed Offline' };
  return { eligible: true, reason: 'node is Elera-enabled and not ready' };
}
