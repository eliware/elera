import { expect, test } from '@jest/globals';
import { createRuntimeState } from '../../src/runtime/runtime-state.mjs';

test('creates serving runtime state for a standalone supervisor', () => {
  const entries = [];
  const result = createRuntimeState({ config: { elera: false }, log: { info: (...value) => entries.push(value) } });
  expect(result.lifecycle.get()).toBe('serving');
  expect(result.recoveryState.snapshot().state).toBe('joining');
  expect(result.telemetry.summary()).toBeDefined();
  result.lifecycle.set('draining');
  expect(entries).toHaveLength(1);
});

test('creates pending recovery state for an Elera supervisor', () => {
  const result = createRuntimeState({ config: { elera: true }, log: { info: () => {} } });
  expect(result.recoveryState.snapshot().state).toBe('pending');
});
