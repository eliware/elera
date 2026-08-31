import { expect, test } from '@jest/globals';
import { createSupervisorDb } from '../../src/runtime/sql-client-wiring.mjs';

test('creates the root-socket supervisor SQL client', () => {
  const result = createSupervisorDb();
  expect(result).toEqual(expect.objectContaining({ query: expect.any(Function), execute: expect.any(Function), close: expect.any(Function) }));
});
