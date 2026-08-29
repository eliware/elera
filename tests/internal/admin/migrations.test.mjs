import { expect, jest, test } from '@jest/globals';
import { createMigrationRunner } from '../../../src/internal/admin/migrations.mjs';

test('orders and applies pending migrations, then reports status', async () => {
  const calls = [];
  const query = async (sql, params) => {
    calls.push([sql, params]);
    if (sql.startsWith('SELECT version FROM')) return [[{ version: 1 }]];
    if (sql.startsWith('SELECT version, name')) return [[{ version: 1, name: 'base' }]];
    return [[]];
  };
  const runner = createMigrationRunner({ query, migrations: [
    { version: 2, name: 'second', statements: ['CREATE TABLE second (id INT)'] },
    { version: 1, name: 'base', statements: ['CREATE TABLE base (id INT)'] },
  ] });
  await expect(runner.migrate()).resolves.toEqual({ applied: [{ version: 1, name: 'base' }] });
  expect(calls.some(([sql]) => sql.includes('CREATE TABLE second'))).toBe(true);
  expect(calls.some(([sql]) => sql === 'START TRANSACTION')).toBe(true);
});

test('rejects invalid dependencies and migration definitions', async () => {
  expect(() => createMigrationRunner({})).toThrow('query function');
  expect(() => createMigrationRunner({ query: jest.fn(), migrations: {} })).toThrow('migrations must be an array');
  const runner = createMigrationRunner({ query: async () => [[{ version: 0 }]], migrations: [{ version: 1, name: '', statements: [] }] });
  await expect(runner.migrate()).rejects.toThrow('invalid migration');
  const invalidStatement = createMigrationRunner({ query: async () => [[{ version: 0 }]], migrations: [{ version: 1, name: 'bad', statements: [''] }] });
  await expect(invalidStatement.migrate()).rejects.toThrow('non-empty strings');
});

test('reports status and skips migrations already applied', async () => {
  const query = jest.fn(async (sql) => {
    if (sql.startsWith('SELECT version, name')) return [[{ version: 1, name: 'base' }]];
    if (sql.startsWith('SELECT version FROM')) return [[{ version: 1 }]];
    return [[]];
  });
  const runner = createMigrationRunner({ query, migrations: [{ version: 1, name: 'base', statements: ['SELECT 1'] }] });
  await expect(runner.status()).resolves.toEqual({ applied: [{ version: 1, name: 'base' }] });
  await runner.migrate();
  expect(query.mock.calls.some(([sql]) => sql === 'SELECT 1')).toBe(false);
});

test('rolls back failed migrations and tolerates rollback failure', async () => {
  const query = jest.fn(async (sql) => {
    if (sql.startsWith('SELECT version FROM')) return [[]];
    if (sql === 'COMMIT') throw new Error('commit failed');
    if (sql === 'ROLLBACK') throw new Error('rollback failed');
    return [[]];
  });
  const runner = createMigrationRunner({ query, migrations: [{ version: 1, name: 'base', statements: ['SELECT 1'] }] });
  await expect(runner.migrate()).rejects.toThrow('commit failed');
  expect(query.mock.calls.some(([sql]) => sql === 'ROLLBACK')).toBe(true);
});

test('rejects invalid versions and non-string statements', async () => {
  const query = async (sql) => sql.startsWith('SELECT version FROM') ? [[]] : [[]];
  await expect(createMigrationRunner({ query, migrations: [{ version: 1.5, name: 'bad', statements: [] }] }).migrate()).rejects.toThrow('invalid migration');
  await expect(createMigrationRunner({ query, migrations: [{ version: 1, name: 'bad', statements: [42] }] }).migrate()).rejects.toThrow('non-empty strings');
});
