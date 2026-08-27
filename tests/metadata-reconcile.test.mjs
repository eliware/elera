import { expect, test } from '@jest/globals';
import { createMetadataReconciler } from '../src/metadata/reconcile.mjs';

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
