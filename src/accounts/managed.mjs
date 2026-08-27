import { randomBytes } from 'node:crypto';
import { literal, accountName } from './sql.mjs';

const secret = () => randomBytes(24).toString('base64url');
export function createManagedAccounts({ query } = {}) {
  if (typeof query !== 'function') throw new TypeError('query function is required');
  return {
    async provision({ user, host = '%', database, grants = [] }) { accountName(user); if (typeof database !== 'string' || !database) throw new TypeError('database is required'); const password = secret(); await query(`CREATE USER IF NOT EXISTS ${literal(user)}@${literal(host)} IDENTIFIED BY ${literal(password)}`); await query(`ALTER USER ${literal(user)}@${literal(host)} IDENTIFIED BY ${literal(password)}`); await query(`REVOKE ALL PRIVILEGES, GRANT OPTION FROM ${literal(user)}@${literal(host)}`); for (const grant of grants) { if (typeof grant !== 'string' || !/^(SELECT|INSERT|UPDATE|DELETE|EXECUTE|CREATE|ALTER|INDEX|REFERENCES)(,\s*(SELECT|INSERT|UPDATE|DELETE|EXECUTE|CREATE|ALTER|INDEX|REFERENCES))*$/i.test(grant)) throw Object.assign(new Error('invalid grant policy'), { statusCode: 400 }); await query(`GRANT ${grant} ON ${literal(database)}.* TO ${literal(user)}@${literal(host)}`); } await query('FLUSH PRIVILEGES'); return { user, host, database, grants, password }; },
    async revoke({ user, host = '%' }) { accountName(user); await query(`DROP USER IF EXISTS ${literal(user)}@${literal(host)}`); return { user, host, revoked: true }; },
    async verify({ user, host = '%' }) { accountName(user); const [rows] = await query(`SHOW GRANTS FOR ${literal(user)}@${literal(host)}`); return { user, host, verified: rows.length > 0, grants: rows.map((row) => Object.values(row)[0]) }; }
  };
}
