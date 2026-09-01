import { createRecoveryState } from '../../../src/cluster/cold-bootstrap/recovery-state.mjs';

test('enforces safe recovery transitions', () => {
  const state = createRecoveryState();
  state.set('collecting-evidence');
  state.set('awaiting-quorum');
  state.set('recovery-authorized');
  state.set('bootstrapping');
  expect(() => state.set('pending')).toThrow('invalid recovery transition');
});
test('exposes state and resets optional details on transition', () => {
  const state = createRecoveryState();
  expect(state.get()).toBe('pending');
  state.set('collecting-evidence', { reason: 'scan', epoch: 'e' });
  expect(state.get()).toBe('collecting-evidence');
  expect(state.set('awaiting-quorum')).toEqual({ state: 'awaiting-quorum' });
});
test('allows recovery to recollect evidence after an outage', () => {
  const state = createRecoveryState('cluster-unavailable');
  expect(state.set('collecting-evidence').state).toBe('collecting-evidence');
});
test('includes optional reason and epoch only when present', () => { const state = createRecoveryState(); expect(state.snapshot()).toEqual({ state: 'pending' }); expect(state.set('collecting-evidence', { reason: 'collecting', epoch: 'e1' })).toEqual({ state: 'collecting-evidence', reason: 'collecting', epoch: 'e1' }); });
test('reaches a terminal complete state after bootstrap or join', () => {
  const state = createRecoveryState('bootstrapping');
  expect(state.set('complete', { epoch: 'e1' })).toMatchObject({ state: 'complete', epoch: 'e1' });
  expect(state.set('collecting-evidence').state).toBe('collecting-evidence');
});

test('supports every valid recovery path and rejects invalid state names', () => {
  expect(() => createRecoveryState('unknown')).toThrow('invalid recovery state');
  const bootstrap = createRecoveryState();
  bootstrap.set('collecting-evidence');
  bootstrap.set('awaiting-quorum');
  bootstrap.set('recovery-authorized');
  bootstrap.set('bootstrapping');
  bootstrap.set('complete');
  bootstrap.set('cluster-unavailable');
  bootstrap.set('blocked-ambiguous');
  bootstrap.set('collecting-evidence');
  expect(() => bootstrap.set('complete')).toThrow('invalid recovery transition');

  const join = createRecoveryState('joining');
  join.set('complete');
  expect(join.snapshot()).toMatchObject({ state: 'complete' });
  expect(() => join.set('not-a-state')).toThrow('invalid recovery state');
});

test('supports idempotent transitions and preserves falsy optional details as absent', () => {
  const state = createRecoveryState('joining');
  expect(state.set('joining', { reason: '', epoch: 0 })).toEqual({ state: 'joining' });
  expect(state.set('joining', { reason: 'still joining', epoch: 'e2' })).toEqual({ state: 'joining', reason: 'still joining', epoch: 'e2' });
});

test('allows a blocked recovery to resume as a normal Galera join', () => {
  const state = createRecoveryState('blocked-ambiguous');
  expect(state.set('joining', { reason: 'component reformed' })).toMatchObject({ state: 'joining', reason: 'component reformed' });
});
