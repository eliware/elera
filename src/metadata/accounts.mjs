const quote = (value) => `'${String(value).replaceAll('\\', '\\\\').replaceAll("'", "''")}'`;
export async function ensureReplicationAccounts({ query, environment = process.env }) {
  const definitions = [
    ['ELERA_SST_USER', 'ELERA_SST_PASSWORD', 'REPLICATION CLIENT, RELOAD, PROCESS, LOCK TABLES'],
    ['ELERA_HEALTH_USER', 'ELERA_HEALTH_PASSWORD', 'PROCESS, REPLICATION CLIENT']
  ];
  const accounts = [];
  for (const [userKey, passwordKey, privileges] of definitions) {
    const user = environment[userKey]; if (!user) continue;
    await query(`CREATE USER IF NOT EXISTS ${quote(user)}@'%' IDENTIFIED BY ${quote(environment[passwordKey] ?? '')}`);
    await query(`GRANT ${privileges} ON *.* TO ${quote(user)}@'%'`);
    accounts.push({ user, purpose: userKey === 'ELERA_SST_USER' ? 'sst' : 'health' });
  }
  return accounts;
}
