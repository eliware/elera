const STATES = new Set(['serving', 'draining', 'stopping', 'stopped']);

export function createLifecycleState({ initial = 'serving', onChange } = {}) {
  if (!STATES.has(initial)) throw new TypeError('invalid lifecycle state');
  let state = initial;
  return {
    get: () => state,
    set(next) {
      if (!STATES.has(next)) throw new TypeError('invalid lifecycle state');
      if (next !== state) { state = next; onChange?.(next); }
      return state;
    },
  };
}
