export function loadSupervisorConfig(environment = process.env) {
  const number = (name, fallback) => { const value = Number(environment[name] ?? fallback); if (!Number.isInteger(value) || value < 1 || value > 65535) throw new Error(`${name} must be a valid TCP port`); return value; };
  return Object.freeze({
    httpPort: number('GALERA_HTTP_PORT', 8080), agentPort: number('GALERA_AGENT_PORT', 33060), performancePort: number('GALERA_PERFORMANCE_AGENT_PORT', 33070),
    timeoutMs: Number(environment.GALERA_QUERY_TIMEOUT_MS ?? 5000), startupTimeoutMs: Number(environment.GALERA_STARTUP_TIMEOUT_MS ?? 30000), dataDir: environment.MARIADB_DATA_DIR ?? '/var/lib/mysql', galera: environment.GALERA === '1',
    environment,
  });
}

export function mariaDbArguments(config) {
  const args = [...(config.intentConfigPath ? [`--defaults-extra-file=${config.intentConfigPath}`] : []), `--datadir=${config.dataDir}`, '--user=mysql', '--bind-address=0.0.0.0', '--binlog-format=ROW'];
  if (config.galera) { if (config.environment.GALERA_BOOTSTRAP === 'true') args.push('--wsrep-new-cluster'); args.push('--wsrep-on=ON', '--wsrep-provider=/usr/lib/galera/libgalera_smm.so', `--wsrep-cluster-name=${config.environment.GALERA_CLUSTER_NAME ?? 'local-galera'}`, `--wsrep-cluster-address=${config.environment.GALERA_CLUSTER_ADDRESS ?? 'gcomm://'}`, `--wsrep-node-name=${config.environment.GALERA_NODE_NAME ?? 'galera'}`, `--wsrep-node-address=${config.environment.GALERA_NODE_ADDRESS ?? '127.0.0.1'}`); }
  return args;
}
