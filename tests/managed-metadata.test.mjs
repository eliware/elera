import { createManagedMetadata } from '../src/metadata/managed.mjs';
import { createSecretBox } from '../src/metadata/secret-box.mjs';

test('manages databases, identities, and scoped tokens without exposing policy SQL', async () => {
  const calls = [];
  const managed = createManagedMetadata({ credentialKey: 'test-key', query: async (sql) => { calls.push(sql); if (sql.includes('FROM `elera_meta`.managed_databases')) return [[{ name: 'billing', application: 'payments' }]]; if (sql.includes('FROM `elera_meta`.identities')) return [[{ name: 'runtime', application: 'payments' }]]; if (sql.includes('FROM `elera_meta`.scoped_tokens')) return [[{ name: 'app-token', application: 'payments', identity: 'runtime', scopes_json: '["database:read"]' }]]; return [[]]; } });
  expect(await managed.createDatabase({ application: 'payments', databaseName: 'billing' })).toEqual({ application: 'payments', database: 'billing' });
  const identity = await managed.createIdentity({ application: 'payments', databaseName: 'billing', identity: 'runtime', purpose: 'runtime', grants: ['SELECT'] });
  expect(identity.username).toBe('payments_runtime'); expect(identity.password).toBeTruthy();
  expect(await managed.listDatabases()).toHaveLength(1); expect(await managed.listIdentities('payments')).toHaveLength(1);
  const token = await managed.issueToken({ tokenName: 'app-token', application: 'payments', identity: 'runtime', scopes: ['database:read'] });
  expect(token.token).toBeTruthy(); expect((await managed.authenticate(token.token)).scopes).toEqual(['database:read']); expect(await managed.revokeToken('app-token')).toEqual({ name: 'app-token', revoked: true }); expect(await managed.revokeIdentity('runtime')).toEqual({ identity: 'runtime', revoked: true }); expect(calls.some((sql) => sql.includes('CREATE DATABASE'))).toBe(true);
  await managed.issueToken({ tokenName: 'global-token' });
});

test('validates managed names, purposes, and grants', async () => {
  expect(() => createManagedMetadata()).toThrow('query function');
  const managed = createManagedMetadata({ credentialKey: 'test-key', query: async () => [[]] });
  await expect(managed.createDatabase({ application: 'bad name', databaseName: 'db' })).rejects.toThrow('application is invalid');
  await expect(managed.createIdentity({ application: 'app', databaseName: 'db', identity: 'id', purpose: 'owner' })).rejects.toThrow('purpose is invalid');
  await expect(managed.createIdentity({ application: 'app', databaseName: 'db', identity: 'id', grants: ['GRANT OPTION'] })).rejects.toThrow('invalid grant policy');
  expect(await managed.authenticate()).toBeNull(); expect(await managed.authenticate('missing')).toBeNull();
  const empty = createManagedMetadata({ query: async () => [[]] }); expect(await empty.authenticate('missing')).toBeNull();
  const noScopes = createManagedMetadata({ query: async () => [[{ name: 'token', scopes_json: null }]] }); expect((await noScopes.authenticate('token')).scopes).toEqual([]);
  const unconfigured = createManagedMetadata({ query: async () => [[]] }); await expect(unconfigured.createIdentity({ application: 'app', databaseName: 'db', identity: 'id' })).rejects.toThrow('encryption'); await expect(unconfigured.rotateIdentity('id')).rejects.toThrow('encryption'); await expect(unconfigured.lease({ identity: 'id' })).rejects.toThrow('encryption');
  const rotating = createManagedMetadata({ credentialKey: 'test-key', query: async (sql) => sql.includes('SELECT username') ? [[{ username: 'payments_runtime' }]] : [[]] }); expect((await rotating.rotateIdentity('runtime')).rotated).toBe(true);
  const missingIdentity = createManagedMetadata({ credentialKey: 'test-key', query: async () => [[]] }); await expect(missingIdentity.rotateIdentity('runtime')).rejects.toThrow('identity not found');
  const sealed = createSecretBox('test-key').seal('password'); const leasing = createManagedMetadata({ credentialKey: 'test-key', query: async () => [[{ application: 'payments', database: 'billing', username: 'payments_runtime', credential_ciphertext: sealed }]] }); expect((await leasing.lease({ identity: 'runtime' })).password).toBe('password');
  const missingLease = createManagedMetadata({ credentialKey: 'test-key', query: async () => [[]] }); await expect(missingLease.lease({ identity: 'runtime' })).rejects.toThrow('identity not found');
});
