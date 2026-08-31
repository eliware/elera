import { META_DATABASE, META_SCHEMA } from './schema.mjs';
import { ensureReplicationAccounts } from './accounts.mjs';
export function createMetadataService({ query, database = META_DATABASE }) {
  if (typeof query !== 'function') throw new TypeError('query function is required');
  const scoped = (sql, params) => query(sql.replaceAll('metadata', `\`${database}\`.metadata`), params);
  return {
    async status() { try { await query(`SELECT 1 FROM \`${database.replaceAll('`', '``')}\`.applications LIMIT 1`); return { initialized: true, database }; } catch { return { initialized: false, database }; } },
    async initialize(environment = process.env) { await query(`CREATE DATABASE IF NOT EXISTS \`${database.replaceAll('`', '``')}\``); for (const statement of META_SCHEMA) await scoped(statement); return { database, schema: 'current', accounts: await ensureReplicationAccounts({ query, environment }), initialized: true }; },
    async verify() { const status = await this.status(); return { ...status, verified: status.initialized }; }
  };
}
