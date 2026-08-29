import { expect, test } from '@jest/globals';
import { createSqlVerifier } from '../../../src/internal/verification/sql.mjs';

test('verifies connectivity, schema, account, and aggregate results', async () => {
  const query = async (sql) => {
    if (sql.startsWith('SHOW GRANTS')) return [[{ Grant: 'GRANT SELECT' }]];
    if (sql.includes('information_schema')) return [[{ SCHEMA_NAME: 'billing' }]];
    return [[]];
  };
  const verifier = createSqlVerifier({ query });
  await expect(verifier.connectivity()).resolves.toEqual({ verified: true });
  await expect(verifier.schema('billing')).resolves.toMatchObject({ verified: true });
  await expect(verifier.account('worker')).resolves.toMatchObject({ verified: true, grants: ['GRANT SELECT'] });
  await expect(verifier.all({ database: 'billing', user: 'worker' })).resolves.toMatchObject({ verified: true });
});

test('reports missing schema and account and escapes quoted names', async () => {
  const queries = [];
  const verifier = createSqlVerifier({ query: async (sql) => { queries.push(sql); return [[]]; } });
  await expect(verifier.schema("bill'ing")).resolves.toMatchObject({ verified: false });
  await expect(verifier.account("work'er")).resolves.toMatchObject({ verified: false, grants: [] });
  await expect(verifier.all({ database: 'missing', user: 'missing' })).resolves.toMatchObject({ verified: false });
  expect(queries.some((sql) => sql.includes("bill''ing"))).toBe(true);
});

test('requires a query function', () => expect(() => createSqlVerifier()).toThrow('query function'));
