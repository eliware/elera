import { expect, jest, test } from '@jest/globals';
import { createRecoveryControl } from '../../src/recovery/control.mjs';
import { createRecoveryState } from '../../src/cluster/cold-bootstrap/recovery-state.mjs';

test('records acknowledged and aborted recovery decisions', () => {
  const log = { warn: jest.fn() };
  const control = createRecoveryControl({ state: createRecoveryState(), log, now: () => 0 });
  expect(control.acknowledge('approved')).toMatchObject({ state: 'pending', acknowledged: true });
  expect(control.abort('cancelled').state).toBe('cluster-unavailable');
  expect(control.events()).toHaveLength(2);
  expect(log.warn).toHaveBeenCalledTimes(2);
});

test('requires a recovery state', () => expect(() => createRecoveryControl()).toThrow('recovery state'));

test('bounds the recovery event history and supplies default reasons', () => {
  const control = createRecoveryControl({ state: createRecoveryState() });
  for (let index = 0; index < 105; index += 1) control.record(`event-${index}`);
  expect(control.events()).toHaveLength(100);
  control.acknowledge();
  expect(control.events().at(-1).reason).toBe('operator acknowledged recovery');
});

test('records custom events with timestamps and returns defensive event copies', () => {
  const control = createRecoveryControl({ state: createRecoveryState(), now: () => 1000 });
  const event = control.record('recovery.test', { node: 'one' });
  expect(event).toMatchObject({ type: 'recovery.test', at: new Date(1000).toISOString(), node: 'one' });
  const events = control.events(); events.pop();
  expect(control.events()).toHaveLength(1);
});

test('exposes the current recovery snapshot through status', () => {
  const state = createRecoveryState('cluster-unavailable');
  const control = createRecoveryControl({ state });
  expect(control.status()).toEqual({ state: 'cluster-unavailable' });
});
