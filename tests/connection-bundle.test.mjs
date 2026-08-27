import { expect, test } from '@jest/globals';
import { connectionBundleFromConfig, validateConnectionBundle } from '../src/connection-bundle.mjs';
import { validateBundle } from '@eliware/elera-lib';
import { validateCredentialLeaseRequest, validateRoutePolicy } from '../src/routing-policy.mjs';

const routes = { primary: [{ host: 'sql0', port: 3306, weight: 100 }], balanced: [{ host: 'sql0', port: 3306, weight: 100 }] };
test('validates and builds a connection bundle', () => { const bundle = connectionBundleFromConfig({ database: 'app', identity: 'runtime', username: 'app', password: 'secret', routes, expiresAt: '2099-01-01T00:00:00Z' }); expect(bundle.routes.primary[0].port).toBe(3306); });
test('emits a bundle accepted by elera-lib', () => { const bundle = connectionBundleFromConfig({ database: 'app', identity: 'runtime', username: 'app', password: 'secret', routes, expiresAt: '2099-01-01T00:00:00Z' }); expect(validateBundle(bundle)).toBe(bundle); });
test('rejects incomplete or invalid bundles', () => { expect(() => validateConnectionBundle(null)).toThrow(); expect(() => validateConnectionBundle({ database: 'app', identity: 'x', expiresAt: '2099-01-01', routes: { primary: [], balanced: [{ host: 'x', port: 0 }] } })).toThrow(); });
test('validates routing and lease policy inputs', () => { expect(validateRoutePolicy()).toBe('auto'); expect(validateRoutePolicy('balanced')).toBe('balanced'); expect(() => validateRoutePolicy('bad')).toThrow(); expect(validateCredentialLeaseRequest({ database: 'app', identity: 'runtime' }).routes).toEqual(['primary', 'balanced']); expect(() => validateCredentialLeaseRequest({ database: 'app', identity: 'runtime', routes: ['bad'] })).toThrow(); expect(() => validateCredentialLeaseRequest({ database: '', identity: 'runtime' })).toThrow(); });
