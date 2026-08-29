import { expect, test } from '@jest/globals';
import { createBootstrapCredentialLease } from '../src/bootstrap/lease.mjs';

test('creates a local bootstrap bundle for CLI SQL smoke tests', () => {
  const lease = createBootstrapCredentialLease({ RUNTIME_NODE_ADDRESS: '127.0.0.1' });
  const bundle = lease({ database: 'app', identity: 'smoke', routes: ['primary', 'balanced'] });
  expect(bundle).toMatchObject({ username: 'root', password: '' });
  expect(bundle.routes.primary[0].port).toBe(3306);
  expect(bundle.routes.balanced[0].host).toBe('127.0.0.1');
});

test('uses an explicitly advertised host for remote consumers', () => {
  const bundle = createBootstrapCredentialLease({ RUNTIME_NODE_ADDRESS: 'elera-single' })({ database: 'app', identity: 'smoke' });
  expect(bundle.routes.primary[0].host).toBe('elera-single');
});

test('fills safe local defaults when bootstrap environment is incomplete', () => {
  const bundle = createBootstrapCredentialLease({})({ database: 'app', identity: 'smoke' });
  expect(bundle).toMatchObject({ username: 'root', password: '' });
  expect(bundle.routes.primary[0]).toMatchObject({ host: '127.0.0.1', port: 3306 });
  expect(bundle.routes.balanced[0]).toEqual(bundle.routes.primary[0]);
});
