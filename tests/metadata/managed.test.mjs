import { createManagedMetadata } from '../../src/metadata/managed.mjs';
import { createSecretBox } from '../../src/metadata/secret-box.mjs';
import { createHash } from 'node:crypto';

test('manages databases, identities, and scoped tokens without exposing policy SQL', async () => {
  const calls = []; let tokenHash;
  const managed = createManagedMetadata({ credentialKey: 'test-key', query: async (sql) => { calls.push(sql); if (sql.includes('INSERT INTO `elera_meta`.scoped_tokens')) tokenHash = sql.match(/VALUES \([^,]+, '([0-9a-f]+)'/)?.[1]; if (sql.includes('FROM `elera_meta`.managed_databases')) return [[{ name: 'billing', application: 'payments' }]]; if (sql.includes('FROM `elera_meta`.identities')) return [[{ name: 'runtime', application: 'payments' }]]; if (sql.includes('FROM `elera_meta`.scoped_tokens')) return [[{ name: 'app-token', application: 'payments', identity: 'runtime', token_hash: tokenHash, scopes_json: '["database:read"]' }]]; return [[]]; } });
  expect(await managed.createDatabase({ application: 'payments', databaseName: 'billing' })).toEqual({ application: 'payments', database: 'billing' });
  const identity = await managed.createIdentity({ application: 'payments', databaseName: 'billing', identity: 'runtime', purpose: 'runtime', grants: ['SELECT'] });
  expect(identity.username).toBe('payments_runtime'); expect(identity.password).toBeTruthy();
  expect(await managed.listDatabases()).toHaveLength(1); expect(await managed.listIdentities('payments')).toHaveLength(1);
  const token = await managed.issueToken({ tokenName: 'app-token', application: 'payments', identity: 'runtime', scopes: ['database:read'] });
  expect(token.token).toBeTruthy(); expect((await managed.authenticate(token.token)).scopes).toEqual(['database:read']); expect(await managed.revokeToken('app-token')).toEqual({ name: 'app-token', revoked: true }); expect(await managed.revokeIdentity('runtime')).toEqual({ identity: 'runtime', revoked: true }); expect(calls.some((sql) => sql.includes('CREATE DATABASE'))).toBe(true);
  await expect(managed.issueToken({ tokenName: 'wrong-app-token', application: 'other', identity: 'runtime' })).rejects.toThrow('does not belong to application');
  await expect(managed.issueToken({ tokenName: 'global-token' })).rejects.toThrow('application is invalid');
});

test('normalizes array and serialized grants when listing identities', async () => {
  const managed = createManagedMetadata({ query: async () => [[
    { name: 'array-grants', application: 'payments', grants_json: ['SELECT'] },
    { name: 'serialized-grants', application: 'payments', grants_json: '["UPDATE"]' }
  ]] });
  expect(await managed.listIdentities()).toEqual([
    { name: 'array-grants', application: 'payments', grants: ['SELECT'] },
    { name: 'serialized-grants', application: 'payments', grants: ['UPDATE'] }
  ]);
});

test('resolves scoped tokens to their application, database, identity, and scopes', async () => {
  const token = 'runtime-token';
  const hash = createHash('sha256').update(token).digest('hex');
  let authenticationSql;
  const managed = createManagedMetadata({ query: async (sql) => {
    authenticationSql = sql;
    return [[{ name: 'runtime-token', application: 'payments', database: 'billing', identity: 'web', token_hash: hash, scopes_json: '["database:read"]' }]];
  } });

  await expect(managed.authenticate(token)).resolves.toEqual({
    name: 'runtime-token', application: 'payments', database: 'billing', identity: 'web', scopes: ['database:read']
  });
  expect(authenticationSql).toContain('LEFT JOIN');
  expect(authenticationSql).toContain('database_name AS database');
});

test('keeps app-admin tokens application-scoped without assigning a database identity', async () => {
  const token = 'app-admin-token';
  const hash = createHash('sha256').update(token).digest('hex');
  const managed = createManagedMetadata({ query: async () => [[{
    name: 'app-admin-token', application: 'payments', database: null, identity: null,
    token_hash: hash, scopes_json: '["app:admin"]'
  }]] });

  await expect(managed.authenticate(token)).resolves.toEqual({
    name: 'app-admin-token', application: 'payments', database: null, identity: null, scopes: ['app:admin']
  });
});

test('validates managed names, purposes, and grants', async () => {
  expect(() => createManagedMetadata()).toThrow('query function');
  const managed = createManagedMetadata({ credentialKey: 'test-key', query: async () => [[]] });
  await expect(managed.createDatabase({ application: 'bad name', databaseName: 'db' })).rejects.toThrow('application is invalid');
  await expect(managed.createIdentity({ application: 'app', databaseName: 'db', identity: 'id', purpose: 'owner' })).rejects.toThrow('purpose is invalid');
  await expect(managed.createIdentity({ application: 'app', databaseName: 'db', identity: 'id', grants: ['GRANT OPTION'] })).rejects.toThrow('invalid grant policy');
  expect(await managed.authenticate()).toBeNull(); expect(await managed.authenticate('missing')).toBeNull();
  const empty = createManagedMetadata({ query: async () => [[]] }); expect(await empty.authenticate('missing')).toBeNull();
  const noScopes = createManagedMetadata({ query: async () => [[{ name: 'token', token_hash: createHash('sha256').update('token').digest('hex'), scopes_json: null }]] }); expect((await noScopes.authenticate('token')).scopes).toEqual([]);
  const serializedScopes = createManagedMetadata({ query: async () => [[{ name: 'token', token_hash: createHash('sha256').update('token').digest('hex'), scopes_json: '["database:write"]' }]] }); expect((await serializedScopes.authenticate('token')).scopes).toEqual(['database:write']);
  const arrayScopes = createManagedMetadata({ query: async () => [[{ name: 'token', token_hash: createHash('sha256').update('token').digest('hex'), scopes_json: ['database:admin'] }]] }); expect((await arrayScopes.authenticate('token')).scopes).toEqual(['database:admin']);
  const malformed = createManagedMetadata({ query: async () => [[{ name: 'malformed' }]] }); expect(await malformed.authenticate('token')).toBeNull();
  const unconfigured = createManagedMetadata({ query: async () => [[]] }); await expect(unconfigured.createIdentity({ application: 'app', databaseName: 'db', identity: 'id' })).rejects.toThrow('encryption'); await expect(unconfigured.rotateIdentity('id')).rejects.toThrow('encryption'); await expect(unconfigured.lease({ identity: 'id' })).rejects.toThrow('encryption');
  const rotating = createManagedMetadata({ credentialKey: 'test-key', query: async (sql) => sql.includes('SELECT username') ? [[{ username: 'payments_runtime' }]] : [[]] }); expect((await rotating.rotateIdentity('runtime')).rotated).toBe(true);
  const missingIdentity = createManagedMetadata({ credentialKey: 'test-key', query: async () => [[]] }); await expect(missingIdentity.rotateIdentity('runtime')).rejects.toThrow('identity not found');
  const tokenIdentityMissing = createManagedMetadata({ credentialKey: 'test-key', query: async () => [[]] }); await expect(tokenIdentityMissing.issueToken({ tokenName: 'token', application: 'app', identity: 'id' })).rejects.toThrow('identity not found');
  const sealed = createSecretBox('test-key').seal('password'); const leasing = createManagedMetadata({ credentialKey: 'test-key', query: async () => [[{ application: 'payments', database: 'billing', username: 'payments_runtime', credential_ciphertext: sealed }]] }); expect((await leasing.lease({ identity: 'runtime' })).password).toBe('password');
  const missingLease = createManagedMetadata({ credentialKey: 'test-key', query: async () => [[]] }); await expect(missingLease.lease({ identity: 'runtime' })).rejects.toThrow('identity not found');
});
