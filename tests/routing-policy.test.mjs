import { expect, test } from '@jest/globals';
import { validateCredentialLeaseRequest, validateRoutePolicy } from '../src/routing-policy.mjs';

test('validates route policies and applies default routes', () => {
  expect(validateRoutePolicy()).toBe('auto');
  expect(validateRoutePolicy('primary')).toBe('primary');
  expect(validateCredentialLeaseRequest({ database: 'billing', identity: 'web' })).toEqual({ database: 'billing', identity: 'web', routes: ['primary', 'balanced'] });
  expect(validateCredentialLeaseRequest({ database: 'billing', identity: 'web', routes: ['balanced'] }).routes).toEqual(['balanced']);
});
test('rejects invalid policies and lease requests', () => {
  expect(() => validateRoutePolicy('unknown')).toThrow('route policy');
  for (const request of [null, {}, { database: 'billing' }, { database: '' }, { database: 'billing', identity: 'web', routes: ['unknown'] }]) expect(() => validateCredentialLeaseRequest(request)).toThrow();
});
