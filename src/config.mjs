import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadIntent, validateIntent } from './intent/model.mjs';
import { runtimeIdentity } from './runtime/identity.mjs';
import { clientDrainTimeout } from './lifecycle/drain-policy.mjs';
const persistedIntent = (environment) => { try { return JSON.parse(readFileSync(join(environment.ELERA_CONFIG_STATE_DIR ?? `${environment.MARIADB_DATA_DIR ?? '/var/lib/mysql'}/elera-state`, 'active.intent.json'), 'utf8')); } catch { return undefined; } };

export function loadSupervisorConfig(environment = process.env, intent = undefined, identity = undefined) {
  identity ??= runtimeIdentity();
  if (!identity?.name) throw new Error('runtime identity is required for supervisor configuration');
  intent ??= persistedIntent(environment) ?? loadIntent(environment, identity);
  validateIntent(intent);
  const members = intent.cluster.members;
  const localMembers = members.filter((member) => member.name === identity.name);
  if (localMembers.length !== 1) {
    throw Object.assign(new Error(`runtime hostname ${identity.name} must match exactly one configured cluster member; expected configured members: ${members.map((member) => member.name).join(', ')}`), { code: 'RUNTIME_IDENTITY_MEMBERSHIP_MISMATCH', statusCode: 400 });
  }
  const local = localMembers[0];
  if (local.address !== identity.name) {
    throw Object.assign(new Error(`runtime hostname ${identity.name} has configured address ${local.address}; configured address must equal the hostname-derived FQDN ${identity.name}`), { code: 'RUNTIME_IDENTITY_ADDRESS_MISMATCH', statusCode: 400 });
  }
  const number = (name, fallback) => { const value = Number(environment[name] ?? fallback); if (!Number.isInteger(value) || value < 1 || value > 65535) throw new Error(`${name} must be a valid TCP port`); return value; };
  return Object.freeze({
    httpPort: number('ELERA_HTTP_PORT', 8080),
    clusterSize: intent?.cluster?.members?.length ?? 1,
    timeoutMs: Number(environment.ELERA_QUERY_TIMEOUT_MS ?? 5000), drainTimeoutMs: clientDrainTimeout(environment.ELERA_DRAIN_TIMEOUT_MS ?? 45000), shutdownTimeoutMs: Number(environment.ELERA_SHUTDOWN_TIMEOUT_MS ?? 60000), startupTimeoutMs: Number(environment.ELERA_STARTUP_TIMEOUT_MS ?? 30000), dataDir: intent?.mariadb?.dataDir ?? environment.MARIADB_DATA_DIR ?? '/var/lib/mysql', elera: (intent?.cluster?.members?.length ?? 1) > 1,
    intent, runtimeIdentity: identity,
    environment,
  });
}

export function mariaDbArguments(config, identity = config.runtimeIdentity) {
  const args = [...(config.intentConfigPath ? [`--defaults-extra-file=${config.intentConfigPath}`] : []), `--datadir=${config.dataDir}`, '--user=mysql', '--bind-address=0.0.0.0', '--binlog-format=ROW'];
  if (config.elera) {
    const members = config.intent.cluster.members;
    if (!identity?.name) throw new Error('runtime identity is required for MariaDB arguments');
    const local = members.find((item) => item.name === identity.name);
    if (!local) throw new Error(`runtime hostname ${identity.name} is not present in configured cluster members`);
    // Provider-level primary-component recovery is deliberately disabled. It
    // can promote multiple cold-starting nodes concurrently; the supervisor's
    // explicit recovery coordinator is the only bootstrap authority.
    if (local.address !== local.name) throw new Error(`cluster member ${local.name} must use hostname -f as its address`);
    args.push('--wsrep-provider-options=pc.recovery=TRUE', '--wsrep-on=ON', '--wsrep-provider=/usr/lib/galera/libgalera_smm.so', `--wsrep-cluster-name=${config.intent.cluster.name}`, `--wsrep-cluster-address=gcomm://${members.map((item) => item.address).join(',')}`, `--wsrep-node-name=${local.name}`, `--wsrep-node-address=${local.name}`);
  }
  return args;
}
