import { intentHash, validateIntent } from './model.mjs';

export function renderMariaDbConfig(input) {
  const intent = validateIntent(input);
  const member = intent.cluster.members[0];
  const lines = ['[mysqld]', `port=${intent.mariadb.port}`, `datadir=${intent.mariadb.dataDir ?? '/var/lib/mysql'}`, 'binlog_format=ROW'];
  if (intent.cluster.members.length > 1) {
    lines.push('wsrep_on=ON', 'wsrep_provider=/usr/lib/galera/libgalera_smm.so', 'wsrep_sst_method=mariabackup', `wsrep_cluster_name=${intent.cluster.name}`, `wsrep_cluster_address=gcomm://${intent.cluster.members.map(item => item.address).join(',')}`, `wsrep_node_name=${member.name}`, `wsrep_node_address=${member.address}`);
  }
  return `${lines.join('\n')}\n`;
}

export function renderIntent(input) { const intent = validateIntent(input); return { hash: intentHash(intent), mariadb: renderMariaDbConfig(intent), intent }; }
