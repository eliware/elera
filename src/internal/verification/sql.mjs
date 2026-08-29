const literal = (value) => `'${String(value).replaceAll("'", "''")}'`;
export function createSqlVerifier({ query } = {}) {
  if (typeof query !== 'function') throw new TypeError('query function is required');
  const connectivity = async () => { await query('SELECT 1 AS healthy'); return { verified: true }; };
  const schema = async (database) => { const [rows] = await query(`SELECT SCHEMA_NAME FROM information_schema.SCHEMATA WHERE SCHEMA_NAME = ${literal(database)}`); return { database, verified: rows.length > 0 }; };
  const account = async (user, host = '%') => { const [rows] = await query(`SHOW GRANTS FOR ${literal(user)}@${literal(host)}`); return { user, host, verified: rows.length > 0, grants: rows.map((row) => Object.values(row)[0]) }; };
  return { connectivity, schema, account, async all({ database, user, host = '%' } = {}) { const [connection, structure, grants] = await Promise.all([connectivity(), schema(database), account(user, host)]); return { verified: connection.verified && structure.verified && grants.verified, connectivity: connection, schema: structure, account: grants }; } };
}
