import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadIntent } from './intent/model.mjs';
import { runtimeIdentity } from './runtime/identity.mjs';
const persistedIntent = (environment) => { try { return JSON.parse(readFileSync(join(environment.ELERA_CONFIG_STATE_DIR ?? `${environment.MARIADB_DATA_DIR ?? '/var/lib/mysql'}/.elera`, 'active.intent.json'), 'utf8')); } catch { return undefined; } };

export function loadSupervisorConfig(environment = process.env, intent = undefined) {
  intent ??= persistedIntent(environment) ?? loadIntent(environment);
  const number = (name, fallback) => { const value = Number(environment[name] ?? fallback); if (!Number.isInteger(value) || value < 1 || value > 65535) throw new Error(`${name} must be a valid TCP port`); return value; };
  return Object.freeze({
    httpPort: number('ELERA_HTTP_PORT', 8080),
    clusterSize: intent?.cluster?.members?.length ?? 1,
    timeoutMs: Number(environment.ELERA_QUERY_TIMEOUT_MS ?? 5000), drainTimeoutMs: Number(environment.ELERA_DRAIN_TIMEOUT_MS ?? 45000), shutdownTimeoutMs: Number(environment.ELERA_SHUTDOWN_TIMEOUT_MS ?? 60000), startupTimeoutMs: Number(environment.ELERA_STARTUP_TIMEOUT_MS ?? 30000), dataDir: intent?.mariadb?.dataDir ?? environment.MARIADB_DATA_DIR ?? '/var/lib/mysql', elera: (intent?.cluster?.members?.length ?? 1) > 1,
    intent, runtimeNodeName: environment.RUNTIME_NODE_NAME ?? runtimeIdentity().name,
    environment,
  });
}

export function mariaDbArguments(config) {
  const args = [...(config.intentConfigPath ? [`--defaults-extra-file=${config.intentConfigPath}`] : []), `--datadir=${config.dataDir}`, '--user=mysql', '--bind-address=0.0.0.0', '--binlog-format=ROW'];
  if (config.elera) { if (config.environment.ELERA_CLUSTER_BOOTSTRAP === 'true' || config.environment.ELERA_BOOTSTRAP === 'true') args.push('--wsrep-new-cluster'); const members = config.intent.cluster.members; const local = members.find((item) => item.name === config.runtimeNodeName) ?? members[0]; args.push('--wsrep-on=ON', '--wsrep-provider=/usr/lib/galera/libgalera_smm.so', `--wsrep-cluster-name=${config.intent.cluster.name}`, `--wsrep-cluster-address=gcomm://${members.map((item) => item.address).join(',')}`, `--wsrep-node-name=${local.name}`, `--wsrep-node-address=${local.address}`); }
  return args;
}
