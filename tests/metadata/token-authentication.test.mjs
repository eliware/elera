import { createHash } from 'node:crypto';
import { expect, test } from '@jest/globals';
import { tokenMatchesHash } from '../../src/metadata/token-authentication.mjs';

test('matches a token against a hexadecimal stored digest', () => {
  const hash = createHash('sha256').update('token').digest('hex');
  expect(tokenMatchesHash('token', hash)).toBe(true);
  expect(tokenMatchesHash('wrong', hash)).toBe(false);
});

test('accepts a binary stored digest and rejects malformed values', () => {
  const hash = createHash('sha256').update('token').digest();
  expect(tokenMatchesHash('token', hash)).toBe(true);
  expect(tokenMatchesHash('token', 'not-a-digest')).toBe(false);
  expect(tokenMatchesHash('', hash)).toBe(false);
  expect(tokenMatchesHash('token', Buffer.from(hash, 'hex'))).toBe(true);
  expect(tokenMatchesHash('token', Buffer.from('00', 'hex'))).toBe(false);
  expect(tokenMatchesHash('token', undefined)).toBe(false);
});
test('handles short binary digests and non-string tokens safely', () => {
  expect(tokenMatchesHash(123, '00')).toBe(false);
  expect(tokenMatchesHash('token', Buffer.from('00', 'hex'))).toBe(false);
  expect(tokenMatchesHash('token', null)).toBe(false);
});
