import { expect, jest, test } from '@jest/globals';
import { createSupervisorSqlClient } from '../../../src/internal/sql/client.mjs';

test('creates a configured pool and delegates SQL operations', async () => {
  const pool = { query: jest.fn(async (...args) => args), execute: jest.fn(async (...args) => args), end: jest.fn(async () => 'closed') };
  const mysqlLib = { createPool: jest.fn(() => pool) };
  const client = createSupervisorSqlClient({ host: 'db', port: '3306', user: 'root', password: 'secret', database: 'elera_meta', socketPath: '/run/mysql.sock', mysqlLib });
  expect(mysqlLib.createPool).toHaveBeenCalledWith(expect.objectContaining({ host: 'db', port: 3306, socketPath: '/run/mysql.sock', waitForConnections: true }));
  await expect(client.query('SELECT 1')).resolves.toEqual(['SELECT 1']);
  await expect(client.execute('SELECT 2', [1])).resolves.toEqual(['SELECT 2', [1]]);
  await expect(client.close()).resolves.toBe('closed');
});
