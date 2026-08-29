import { expect, test, jest } from '@jest/globals';
import { createAdminSql } from '../../../src/internal/admin/sql.mjs';

test('commits successful transactions and runs migrations', async () => {
  const query = jest.fn(async () => [[]]);
  const sql = createAdminSql({ query });
  await expect(sql.transaction(async ({ query: run }) => { await run('SELECT 1'); return 'ok'; })).resolves.toBe('ok');
  await expect(sql.migration(['CREATE TABLE demo (id INT)'])).resolves.toBeUndefined();
  expect(query).toHaveBeenCalledWith('COMMIT');
});

test('rolls back failed work and rejects invalid statements', async () => {
  const query = jest.fn(async (statement) => { if (statement === 'FAIL') throw new Error('failed'); return [[]]; });
  const sql = createAdminSql({ query });
  await expect(sql.transaction(async ({ query: run }) => run('FAIL'))).rejects.toThrow('failed');
  expect(query).toHaveBeenCalledWith('ROLLBACK');
  await expect(sql.migration([''])).rejects.toThrow('non-empty strings');
});

test('requires a query function', () => expect(() => createAdminSql({})).toThrow('query function'));
