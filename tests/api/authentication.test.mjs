import { expect, test } from '@jest/globals';
import { tokenMatches } from '../../src/api/authentication.mjs';

test('rejects requests with missing authentication', () => {
  expect(tokenMatches({ headers: {} }, undefined)).toBe(false);
});
