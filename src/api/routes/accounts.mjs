import { accountName, literal } from '../../accounts/sql.mjs';
import { createManagedAccounts } from '../../accounts/managed.mjs';
import { json, readBody } from '../http.mjs';

const send = (response, status, body) => response.json ? response.json(status, body) : json(response, status, body);
const safeGrant = (value) => String(value).replace(/\s+IDENTIFIED\s+BY\s+PASSWORD\s+'[^']*'/gi, '').replace(/\s+IDENTIFIED\s+BY\s+'[^']*'/gi, '').trim();

export async function handleAccountRoute({ method, path, request, response, db }) {
  const managed = createManagedAccounts({ query: (...args) => db.query(...args) });
  if (method === 'GET' && path === '/api/v1/accounts') { const [rows] = await db.query("SELECT User, Host, plugin, account_locked, password_expired FROM mysql.user WHERE User NOT IN ('mariadb.sys','mysql','root') ORDER BY User, Host"); send(response, 200, { ok: true, accounts: rows }); return true; }
  if (method === 'POST' && path === '/api/v1/accounts/export') { const [rows] = await db.query("SELECT User, Host FROM mysql.user WHERE User NOT IN ('mariadb.sys','mysql','root') ORDER BY User, Host"); const accounts = []; for (const row of rows) { const [grants] = await db.query('SHOW GRANTS FOR ??@??', [row.User, row.Host]).catch(() => [[]]); accounts.push({ user: row.User, host: row.Host, grants: grants.map((grant) => safeGrant(Object.values(grant)[0])).filter(Boolean) }); } send(response, 200, { ok: true, accounts }); return true; }
  if (method === 'POST' && path === '/api/v1/accounts/import') { const body = await readBody(request); if (body.confirm !== true) throw Object.assign(new Error('account import requires confirm: true'), { statusCode: 409 }); const accounts = body.accounts ?? []; for (const account of accounts) { const user = accountName(account.user); const host = String(account.host ?? '%'); await db.query(`CREATE USER IF NOT EXISTS ${literal(user)}@${literal(host)}`); for (const grant of account.grants ?? []) { if (typeof grant !== 'string' || /;|--|\/\*/.test(grant)) throw Object.assign(new Error('invalid grant statement'), { statusCode: 400 }); await db.query(grant); } } send(response, 200, { ok: true, operation: 'accounts.import', changed: true, status: 'completed', count: accounts.length }); return true; }
  if (method === 'POST' && path === '/api/v1/accounts/provision') { const body = await readBody(request); send(response, 200, { ok: true, operation: 'account.provision', data: await managed.provision(body) }); return true; }
  if (method === 'POST' && path === '/api/v1/accounts/revoke') { const body = await readBody(request); send(response, 200, { ok: true, operation: 'account.revoke', data: await managed.revoke(body) }); return true; }
  if (method === 'POST' && path === '/api/v1/accounts/verify') { const body = await readBody(request); const data = await managed.verify(body); send(response, data.verified ? 200 : 503, { ok: data.verified, operation: 'account.verify', data }); return true; }
  return false;
}
