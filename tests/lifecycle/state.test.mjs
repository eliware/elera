import { expect, test, jest } from '@jest/globals';
import { createLifecycleState } from '../../src/lifecycle/state.mjs';

test('tracks valid lifecycle transitions and notifies changes', () => {
  const changes = []; const state = createLifecycleState({ onChange: (value) => changes.push(value) });
  expect(state.get()).toBe('serving');
  for (const value of ['draining', 'stopping', 'stopped']) expect(state.set(value)).toBe(value);
  expect(changes).toEqual(['draining', 'stopping', 'stopped']);
  state.set('stopped'); expect(changes).toHaveLength(3);
});

test('rejects invalid lifecycle states', () => {
  expect(() => createLifecycleState({ initial: 'broken' })).toThrow('invalid lifecycle');
  const state = createLifecycleState(); expect(() => state.set('broken')).toThrow('invalid lifecycle');
});

test('allows a missing change callback and preserves the current state for repeated sets', () => {
  const state = createLifecycleState({ initial: 'draining' });
  expect(state.set('draining')).toBe('draining');
  expect(state.get()).toBe('draining');
});
