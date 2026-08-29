export function createRecoveryControl({ state, now = Date.now, log = {} } = {}) {
  if (!state?.snapshot || !state?.set) throw new TypeError('recovery state is required');
  const events = [];
  const record = (type, data = {}) => {
    const event = { type, at: new Date(now()).toISOString(), ...data };
    events.push(event);
    if (events.length > 100) events.shift();
    return event;
  };
  return {
    status: () => state.snapshot(),
    events: () => [...events],
    acknowledge(reason = 'operator acknowledged recovery') {
      const snapshot = state.snapshot();
      record('recovery.acknowledge', { reason, state: snapshot.state });
      log.warn?.('Recovery acknowledged by operator', { reason });
      return { ...snapshot, acknowledged: true };
    },
    abort(reason = 'operator aborted recovery') {
      const snapshot = state.set('cluster-unavailable', { reason });
      record('recovery.abort', { reason, state: snapshot.state });
      log.warn?.('Recovery aborted by operator', { reason });
      return snapshot;
    },
    record,
  };
}
