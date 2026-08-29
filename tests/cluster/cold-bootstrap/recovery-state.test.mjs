import { createRecoveryState } from '../../../src/cluster/cold-bootstrap/recovery-state.mjs';

test('tracks recovery state and decision metadata', () => {
  const state = createRecoveryState();
  expect(state.snapshot()).toEqual({ state: 'pending' });
  expect(state.set('recovery-authorized', { reason: 'quorum', epoch: 'e1' })).toEqual({ state: 'recovery-authorized', reason: 'quorum', epoch: 'e1' });
  expect(state.get()).toBe('recovery-authorized');
});

test('rejects unknown states', () => {
  expect(() => createRecoveryState('unknown')).toThrow('invalid recovery state');
  expect(() => createRecoveryState().set('unknown')).toThrow('invalid recovery state');
});
