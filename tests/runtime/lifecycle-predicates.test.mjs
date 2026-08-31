import { expect, test } from '@jest/globals';
import { isShuttingDown } from '../../src/runtime/lifecycle-predicates.mjs';

test('identifies draining and stopped lifecycle states', () => {
  expect(isShuttingDown('draining')).toBe(true);
  expect(isShuttingDown('stopping')).toBe(true);
  expect(isShuttingDown('stopped')).toBe(true);
  expect(isShuttingDown('serving')).toBe(false);
});
