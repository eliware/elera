import { expect, test } from '@jest/globals';
import { createMetadataReconciler } from '../../src/metadata/reconcile.mjs';

test('plans and applies missing metadata idempotently', async () => {
  const calls = [];
  const managed = {
    listDatabases: async () => [],
    listIdentities: async () => [],
    createDatabase: async (value) => { calls.push(['database', value]); return value; },
    createIdentity: async (value) => { calls.push(['identity', value]); return value; }
  };
  const reconciler = createMetadataReconciler({ managed });
  const desired = { databases: [{ application: 'app', database: 'appdb' }], identities: [{ application: 'app', database: 'appdb', name: 'runtime', grants: ['SELECT'] }] };
  expect((await reconciler.plan(desired)).changes).toHaveLength(2);
  await expect(reconciler.apply(desired)).rejects.toThrow(/confirm/);
  const result = await reconciler.apply(desired, { confirm: true });
  expect(result.applied).toBe(2);
  expect(calls).toHaveLength(2);
});

test('reconciles accounts, converged state, and optional account service', async () => {
  const calls = [];
  const managed = { listDatabases: async () => [{ name: 'existing' }], listIdentities: async () => [{ application: 'app', name: 'runtime' }], createDatabase: async (value) => { calls.push(value); return value; }, createIdentity: async (value) => { calls.push(value); return value; } };
  const accounts = { list: async () => [{ user: 'existing', host: '%' }], provision: async (value) => { calls.push(value); return value; } };
  const reconciler = createMetadataReconciler({ managed, accounts });
  const desired = { databases: [{ name: 'existing' }, { application: 'app', name: 'newdb' }], identities: [{ application: 'app', name: 'runtime' }, { application: 'app', database: 'newdb', identity: 'writer' }], accounts: [{ user: 'existing' }, { user: 'writer', host: 'db' }] };
  const planned = await reconciler.plan(desired);
  expect(planned.changes.map(({ operation }) => operation)).toEqual(['database.create', 'identity.create', 'account.create']);
  await expect(reconciler.apply(desired, { confirm: true })).resolves.toMatchObject({ applied: 3 });
  const empty = createMetadataReconciler({ managed: { listDatabases: async () => [], listIdentities: async () => [] } });
  await expect(empty.plan()).resolves.toMatchObject({ desired: {}, converged: true });
  await expect(empty.verify({})).resolves.toMatchObject({ verified: true });
});
test('requires the managed metadata service', () => { expect(() => createMetadataReconciler()).toThrow('managed metadata service'); });
test('handles explicitly absent optional account methods and alternate desired field names', async () => {
  const managed = { listDatabases: async () => [], listIdentities: async () => [], createDatabase: async () => ({}), createIdentity: async () => ({}) };
  const reconciler = createMetadataReconciler({ managed, accounts: { list: undefined } });
  const desired = { databases: [{ application: 'app', name: 'db' }], identities: [{ application: 'app', database: 'db', identity: 'id' }] };
  expect((await reconciler.plan(desired)).changes).toHaveLength(2);
});
