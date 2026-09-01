import { expect, test } from '@jest/globals';
import { createBootstrapCredentialLease } from '../../src/bootstrap/lease.mjs';

test('creates a local bootstrap bundle for CLI SQL smoke tests', () => {
  const lease = createBootstrapCredentialLease({}, { name: 'elera-0.example.test' });
  const bundle = lease({ database: 'app', identity: 'elera-0.example.test', routes: ['primary', 'balanced'] });
  expect(bundle).toMatchObject({ username: 'root', password: '' });
  expect(bundle.routes.primary[0].port).toBe(3306);
  expect(bundle.routes.balanced[0].host).toBe('elera-0.example.test');
});

test('uses the shared runtime FQDN for remote consumers', () => {
  const bundle = createBootstrapCredentialLease({}, { name: 'elera-single.example.test' })({ database: 'app', identity: 'elera-single.example.test' });
  expect(bundle.routes.primary[0].host).toBe('elera-single.example.test');
});

test('rejects a missing runtime identity instead of using a local fallback', () => {
  expect(() => createBootstrapCredentialLease({})({ database: 'app', identity: 'smoke' })).toThrow('runtime identity is required');
});

test('fills safe defaults when bootstrap environment is incomplete', () => {
  const bundle = createBootstrapCredentialLease({}, { name: 'elera-0.example.test' })({ database: 'app', identity: 'elera-0.example.test' });
  expect(bundle).toMatchObject({ username: 'root', password: '' });
  expect(bundle.routes.primary[0]).toMatchObject({ host: 'elera-0.example.test', port: 3306 });
  expect(bundle.routes.balanced[0]).toEqual(bundle.routes.primary[0]);
});
