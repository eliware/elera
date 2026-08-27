import { createMigrationRunner } from '@eliware/elera-lib';
import { META_DATABASE, META_MIGRATIONS } from './schema.mjs';
import { ensureReplicationAccounts } from './accounts.mjs';
export function createMetadataService({ query, database = META_DATABASE }) {
  if (typeof query !== 'function') throw new TypeError('query function is required');
  const scoped = (sql, params) => query(sql.replaceAll('schema_migrations', `\`${database}\`.schema_migrations`).replaceAll('metadata', `\`${database}\`.metadata`), params);
  const runner = createMigrationRunner({ query: scoped, migrations: META_MIGRATIONS });
  return {
    async status() { try { return { initialized: true, database, ...(await runner.status()) }; } catch { return { initialized: false, database, applied: [] }; } },
    async initialize(environment = process.env) { await query(`CREATE DATABASE IF NOT EXISTS \`${database.replaceAll('`', '``')}\``); const result = await runner.migrate(); return { database, ...result, accounts: await ensureReplicationAccounts({ query, environment }), initialized: true }; },
    async verify() { const status = await this.status(); return { ...status, verified: status.initialized && status.applied.length >= META_MIGRATIONS.length }; }
  };
}
