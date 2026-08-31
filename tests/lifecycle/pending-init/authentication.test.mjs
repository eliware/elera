import { expect, test } from '@jest/globals';
import { createPendingInitAuthenticator } from '../../../src/lifecycle/pending-init/authentication.mjs';

test('authenticates the configured root token', () => {
  const authenticate = createPendingInitAuthenticator({ ROOT_TOKEN: 'secret' });
  expect(authenticate({ headers: { authorization: 'Bearer secret' } })).toBe(true);
  expect(authenticate({ headers: { authorization: 'Bearer wrong' } })).toBe(false);
  expect(createPendingInitAuthenticator({})({ headers: {} })).toBe(false);
});
