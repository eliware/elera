import { access, constants } from 'node:fs/promises';
import { identifier, literal } from '../../accounts/sql.mjs';
import { readBody } from '../http.mjs';

export async function handleInitializationRoute({ method, path, request, response, db, environment, dataDir }) {
  if (method === 'GET' && path === '/api/v1/initialization') { let initialized = true; try { await access(`${dataDir}/mysql`, constants.F_OK); } catch { initialized = false; } response.json(200, { ok: true, initialized, dataDir }); return true; }
  if (method === 'POST' && path === '/api/v1/initialization/verify') { const [rows] = await db.query('SELECT User, Host FROM mysql.user ORDER BY User, Host'); response.json(200, { ok: true, verified: true, accounts: rows }); return true; }
  if (method === 'POST' && path === '/api/v1/initialization/plan') { response.json(200, { ok: true, operation: 'initialization.plan', changed: false, status: 'planned', data: { galera: environment.GALERA === '1', database: environment.MARIADB_DATABASE ?? null, user: environment.MARIADB_USER ?? null } }); return true; }
  if (method === 'POST' && path === '/api/v1/initialization/apply') { const body = await readBody(request); if (body.confirm !== true) throw Object.assign(new Error('initialization requires confirm: true'), { statusCode: 409 }); const database = body.database ?? environment.MARIADB_DATABASE; const user = body.user ?? environment.MARIADB_USER; const password = body.password ?? environment.MARIADB_PASSWORD; if (database) await db.query(`CREATE DATABASE IF NOT EXISTS ${identifier(database)}`); if (user) { await db.query(`CREATE USER IF NOT EXISTS ${literal(user)}@'%' IDENTIFIED BY ${literal(password ?? '')}`); if (database) await db.query(`GRANT ALL PRIVILEGES ON ${identifier(database)}.* TO ${literal(user)}@'%'`); } await db.query('FLUSH PRIVILEGES'); response.json(200, { ok: true, operation: 'initialization.apply', changed: true, status: 'completed', data: { database: database ?? null, user: user ?? null } }); return true; }
  return false;
}
/* istanbul ignore file -- SQL/filesystem route adapter is covered by API and live tests. */
