import * as mysql from 'mysql2/promise';

export function createSupervisorSqlClient({
  host,
  port,
  user,
  password,
  database,
  socketPath,
  mysqlLib = mysql,
} = {}) {
  const pool = mysqlLib.createPool({
    host,
    port: Number(port),
    user,
    password,
    database,
    socketPath,
    waitForConnections: true,
  });

  return {
    query: (...args) => pool.query(...args),
    execute: (...args) => pool.execute(...args),
    close: () => pool.end(),
  };
}
