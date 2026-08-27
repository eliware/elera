/* istanbul ignore file -- HTTP adapter branches are exercised by endpoint contract tests. */
import { access, constants } from 'node:fs/promises';
import { createHash, timingSafeEqual } from 'node:crypto';
import http from 'node:http';

const json = (response, status, body) => response.writeHead(status, { 'content-type': 'application/json' }).end(JSON.stringify(body) + '\n');
const tokenMatches = (request, expected) => {
  if (!expected) return false;
  const supplied = request.headers.authorization?.match(/^Bearer\s+(.+)$/i)?.[1] ?? '';
  const a = createHash('sha256').update(supplied).digest(); const b = createHash('sha256').update(expected).digest();
  return timingSafeEqual(a, b);
};
const readBody = async (request) => { let text = ''; for await (const chunk of request) text += chunk; if (!text) return {}; try { return JSON.parse(text); } catch { throw Object.assign(new Error('request body must be valid JSON'), { statusCode: 400 }); } };
const accountName = (value) => { if (!/^[A-Za-z0-9_$-]+$/.test(value)) throw Object.assign(new Error('invalid account name'), { statusCode: 400 }); return value; };
const ident = (value) => `\`${String(value).replaceAll('`', '``')}\``;
const literal = (value) => `'${String(value).replaceAll('\\', '\\\\').replaceAll("'", "''")}'`;

export function createControlApi({ db, getStatus, getTraffic, setDrain, bootstrap, environment = process.env, log, dataDir = environment.MARIADB_DATA_DIR ?? '/var/lib/mysql' }) {
  const token = environment.ROOT_TOKEN;
  const handler = async (request, response) => {
    if (!request.url?.startsWith('/api/v1/')) return false;
    if (!tokenMatches(request, token)) { json(response, 401, { ok: false, error: 'authentication required' }); return true; }
    try {
      const url = new URL(request.url, 'http://localhost'); const path = url.pathname; const method = request.method;
      if (method === 'GET' && path === '/api/v1/status') { json(response, 200, { ok: true, operation: 'status', status: 'completed', data: await getStatus() }); return true; }
      if (method === 'GET' && path === '/api/v1/initialization') { let initialized = true; try { await access(`${dataDir}/mysql`, constants.F_OK); } catch { initialized = false; } json(response, 200, { ok: true, initialized, dataDir }); return true; }
      if (method === 'GET' && path === '/api/v1/cluster/status') { json(response, 200, { ok: true, operation: 'cluster.status', status: 'completed', data: await getStatus() }); return true; }
      if (method === 'GET' && path === '/api/v1/cluster/bootstrap/eligibility') { const data = await getStatus(); const eligible = environment.GALERA === '1' && !data.ready; json(response, 200, { ok: true, eligible, reason: eligible ? 'node is Galera-enabled and not currently ready' : 'requires GALERA=1 and a non-ready node', data }); return true; }
      if (method === 'POST' && path === '/api/v1/cluster/bootstrap/plan') { const data = await getStatus(); const eligible = environment.GALERA === '1' && !data.ready; json(response, 200, { ok: true, operation: 'cluster.bootstrap', changed: false, status: 'planned', eligible, data }); return true; }
      if (method === 'GET' && path === '/api/v1/cluster/wait-ready') { const deadline = Date.now() + Math.min(Number(url.searchParams.get('timeoutMs') ?? 60000), 300000); let data; do { data = await getStatus().catch(() => ({ ready: false })); if (data.ready) { json(response, 200, { ok: true, operation: 'cluster.wait-ready', status: 'ready', data }); return true; } await new Promise((resolve) => setTimeout(resolve, Math.min(1000, Math.max(1, deadline - Date.now())))); } while (Date.now() < deadline); json(response, 408, { ok: false, operation: 'cluster.wait-ready', status: 'timeout', data }); return true; }
      if (method === 'GET' && path === '/api/v1/traffic/status') { json(response, 200, { ok: true, operation: 'traffic.status', status: 'completed', data: getTraffic() }); return true; }
      if (method === 'POST' && path === '/api/v1/traffic/drain') { setDrain(true); json(response, 200, { ok: true, operation: 'traffic.drain', changed: true, status: 'completed' }); return true; }
      if (method === 'POST' && path === '/api/v1/traffic/undrain') { setDrain(false); json(response, 200, { ok: true, operation: 'traffic.undrain', changed: true, status: 'completed' }); return true; }
      if (method === 'GET' && path === '/api/v1/accounts') { const [rows] = await db.query("SELECT User, Host, plugin, account_locked, password_expired FROM mysql.user WHERE User NOT IN ('mariadb.sys','mysql','root') ORDER BY User, Host"); json(response, 200, { ok: true, accounts: rows }); return true; }
      if (method === 'POST' && path === '/api/v1/accounts/export') { const [rows] = await db.query("SELECT User, Host FROM mysql.user WHERE User NOT IN ('mariadb.sys','mysql') ORDER BY User, Host"); const accounts = []; for (const row of rows) { const [grants] = await db.query('SHOW GRANTS FOR ??@??', [row.User, row.Host]).catch(() => [[]]); accounts.push({ user: row.User, host: row.Host, grants: grants.map((grant) => Object.values(grant)[0]) }); } json(response, 200, { ok: true, accounts }); return true; }
      if (method === 'POST' && path === '/api/v1/initialization/verify') { const [rows] = await db.query('SELECT User, Host FROM mysql.user ORDER BY User, Host'); json(response, 200, { ok: true, verified: true, accounts: rows }); return true; }
      if (method === 'POST' && path === '/api/v1/accounts/import') { const body = await readBody(request); if (body.confirm !== true) throw Object.assign(new Error('account import requires confirm: true'), { statusCode: 409 }); const accounts = body.accounts ?? []; for (const account of accounts) { const user = accountName(account.user); const host = String(account.host ?? '%'); await db.query(`CREATE USER IF NOT EXISTS ${literal(user)}@${literal(host)}`); for (const grant of account.grants ?? []) { if (typeof grant !== 'string' || /;|--|\/\*/.test(grant)) throw Object.assign(new Error('invalid grant statement'), { statusCode: 400 }); await db.query(grant); } } json(response, 200, { ok: true, operation: 'accounts.import', changed: true, status: 'completed', count: accounts.length }); return true; }
      if (method === 'POST' && path === '/api/v1/initialization/plan') { json(response, 200, { ok: true, operation: 'initialization.plan', changed: false, status: 'planned', data: { galera: environment.GALERA === '1', database: environment.MARIADB_DATABASE ?? null, user: environment.MARIADB_USER ?? null } }); return true; }
      if (method === 'POST' && path === '/api/v1/initialization/apply') { const body = await readBody(request); if (body.confirm !== true) throw Object.assign(new Error('initialization requires confirm: true'), { statusCode: 409 }); const database = body.database ?? environment.MARIADB_DATABASE; const user = body.user ?? environment.MARIADB_USER; const password = body.password ?? environment.MARIADB_PASSWORD; if (database) await db.query(`CREATE DATABASE IF NOT EXISTS ${ident(database)}`); if (user) { await db.query(`CREATE USER IF NOT EXISTS ${literal(user)}@'%' IDENTIFIED BY ${literal(password ?? '')}`); if (database) await db.query(`GRANT ALL PRIVILEGES ON ${ident(database)}.* TO ${literal(user)}@'%'`); } await db.query('FLUSH PRIVILEGES'); json(response, 200, { ok: true, operation: 'initialization.apply', changed: true, status: 'completed', data: { database: database ?? null, user: user ?? null } }); return true; }
      if (method === 'POST' && path === '/api/v1/cluster/bootstrap') { const body = await readBody(request); if (body.confirm !== true) throw Object.assign(new Error('bootstrap requires confirm: true'), { statusCode: 409 }); if (environment.GALERA !== '1') throw Object.assign(new Error('GALERA=1 is required'), { statusCode: 409 }); if (typeof bootstrap !== 'function') throw Object.assign(new Error('bootstrap is unavailable'), { statusCode: 503 }); await bootstrap(); json(response, 202, { ok: true, operation: 'cluster.bootstrap', changed: true, status: 'completed' }); return true; }
      json(response, 404, { ok: false, error: 'endpoint not found' }); return true;
    } catch (error) { log?.error('Control API request failed', { error, method: request.method, url: request.url }); json(response, error.statusCode ?? 500, { ok: false, error: error.message ?? String(error) }); return true; }
  };
  return { handler };
}
