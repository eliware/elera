import { expect, test } from '@jest/globals';
import { createSupervisorControl } from '../../src/runtime/control-wiring.mjs';

test('creates the control API from supplied dependencies', () => {
  const result = createSupervisorControl({ db: { query: async () => [] }, environment: {}, log: {} });
  expect(result).toEqual(expect.objectContaining({ handler: expect.any(Function) }));
});
