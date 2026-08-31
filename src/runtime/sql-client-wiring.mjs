import { createSupervisorSqlClient } from '../internal/sql/client.mjs';

export function createSupervisorDb({ environment = process.env } = {}) {
  return createSupervisorSqlClient({ host: '127.0.0.1', port: '3306', user: 'root', password: '', database: 'elera_meta', socketPath: '/run/mysqld/mysqld.sock', environment });
}
