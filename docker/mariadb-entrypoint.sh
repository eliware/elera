#!/bin/sh
set -eu

datadir="${MARIADB_DATA_DIR:-/var/lib/mysql}"
mkdir -p "$datadir" /run/mysqld
chown -R mysql:mysql "$datadir" /run/mysqld

if [ ! -d "$datadir/mysql" ]; then
  mariadb-install-db --user=mysql --datadir="$datadir" --skip-test-db
fi

args="--datadir=$datadir --user=mysql --bind-address=0.0.0.0 --binlog-format=ROW"
if [ "${GALERA_BOOTSTRAP:-false}" = "true" ]; then
  args="$args --wsrep-new-cluster"
fi

if [ -n "${GALERA_CLUSTER_ADDRESS:-}" ]; then
  args="$args --wsrep-on=ON --wsrep-provider=/usr/lib/galera/libgalera_smm.so --wsrep-cluster-name=${GALERA_CLUSTER_NAME:-local-galera} --wsrep-cluster-address=${GALERA_CLUSTER_ADDRESS} --wsrep-node-name=${GALERA_NODE_NAME:-$(hostname)} --wsrep-node-address=${GALERA_NODE_ADDRESS:-$(hostname)}"
fi

exec mariadbd $args
