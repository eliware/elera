import { expect, test } from '@jest/globals';
import { validateGrantPolicy } from '../../src/accounts/grant-policy.mjs';

test('accepts supported single and comma-separated privileges', () => {
  expect(validateGrantPolicy('SELECT')).toBe('SELECT');
  expect(validateGrantPolicy('SELECT, INSERT, UPDATE')).toBe('SELECT, INSERT, UPDATE');
  expect(validateGrantPolicy('show view')).toBe('show view');
});

test('rejects malformed or unsupported grant policies', () => {
  for (const value of [undefined, null, '', 'SELECT,', 'SELECT; DROP', 'GRANT SELECT']) expect(() => validateGrantPolicy(value)).toThrow('invalid grant policy');
});
