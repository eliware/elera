import { expect, jest, test } from '@jest/globals';
import { createSupervisorErrorHandlers } from '../../src/runtime/error-wiring.mjs';

test('registers supervisor process error handlers', () => {
  expect(createSupervisorErrorHandlers({ log: { error: jest.fn(), warn: jest.fn(), debug: jest.fn() } })).toBeDefined();
});
