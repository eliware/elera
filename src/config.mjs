export function loadSupervisorConfig(environment = process.env) {
  const number = (name, fallback) => { const value = Number(environment[name] ?? fallback); if (!Number.isInteger(value) || value < 1 || value > 65535) throw new Error(`${name} must be a valid TCP port`); return value; };
  return Object.freeze({
    httpPort: number('ELERA_HTTP_PORT', 8080),
    clusterSize: number('ELERA_CLUSTER_SIZE', 1),
    timeoutMs: Number(environment.ELERA_QUERY_TIMEOUT_MS ?? 5000), shutdownTimeoutMs: Number(environment.ELERA_SHUTDOWN_TIMEOUT_MS ?? 30000), startupTimeoutMs: Number(environment.ELERA_STARTUP_TIMEOUT_MS ?? 30000), dataDir: environment.MARIADB_DATA_DIR ?? '/var/lib/mysql', elera: environment.ELERA === '1',
    environment,
  });
}

export function mariaDbArguments(config) {
  const args = [...(config.intentConfigPath ? [`--defaults-extra-file=${config.intentConfigPath}`] : []), `--datadir=${config.dataDir}`, '--user=mysql', '--bind-address=0.0.0.0', '--binlog-format=ROW'];
  if (config.elera) { if (config.environment.ELERA_BOOTSTRAP === 'true' || config.environment.ELERA_CLUSTER_BOOTSTRAP === 'true') args.push('--wsrep-new-cluster'); args.push('--wsrep-on=ON', '--wsrep-provider=/usr/lib/galera/libgalera_smm.so', `--wsrep-cluster-name=${config.environment.ELERA_CLUSTER_NAME ?? 'local-elera'}`, `--wsrep-cluster-address=${config.environment.ELERA_CLUSTER_ADDRESS ?? 'gcomm://'}`, `--wsrep-node-name=${config.environment.ELERA_NODE_NAME ?? 'elera'}`, `--wsrep-node-address=${config.environment.ELERA_NODE_ADDRESS ?? '127.0.0.1'}`); }
  return args;
}
