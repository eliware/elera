import { expect, test } from '@jest/globals';
import { validateCredentialLeaseRequest, validateRoutePolicy } from '../../src/routing-policy.mjs';

test('validates routing and lease policy inputs', () => { expect(validateRoutePolicy()).toBe('auto'); expect(validateRoutePolicy('balanced')).toBe('balanced'); expect(() => validateRoutePolicy('bad')).toThrow(); expect(validateCredentialLeaseRequest({ database: 'app', identity: 'runtime' }).routes).toEqual(['primary', 'balanced']); expect(() => validateCredentialLeaseRequest({ database: 'app', identity: 'runtime', routes: ['bad'] })).toThrow(); expect(() => validateCredentialLeaseRequest({ database: '', identity: 'runtime' })).toThrow(); });
