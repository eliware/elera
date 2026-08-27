#!/bin/sh
set -eu

datadir="${MARIADB_DATA_DIR:-/var/lib/mysql}"
bootstrap="${ELERA_BOOTSTRAP:-false}"
data_action="$(node /app/src/lifecycle/data-directory-cli.mjs "$datadir" "$bootstrap")"

if [ "$data_action" = "initialize" ]; then
  first_boot=true
  mariadb-install-db --user=mysql --datadir="$datadir" --skip-test-db --auth-root-authentication-method=normal

  init_socket=/run/mysqld/init.sock
  mariadbd --datadir="$datadir" --user=mysql --skip-networking --socket="$init_socket" &
  init_pid=$!
  trap 'kill "$init_pid" 2>/dev/null || true' EXIT
  i=0
  until mariadb-admin --socket="$init_socket" ping --silent >/dev/null 2>&1; do
    i=$((i + 1))
    [ "$i" -lt 60 ] || { echo "timed out waiting for MariaDB initialization" >&2; exit 1; }
    sleep 1
  done

  mariadb --socket="$init_socket" -uroot <<SQL
ALTER USER 'root'@'localhost' IDENTIFIED BY '${MARIADB_ROOT_PASSWORD:-}';
$(if [ -n "${MARIADB_DATABASE:-}" ]; then printf 'CREATE DATABASE IF NOT EXISTS `%s`;\n' "${MARIADB_DATABASE}"; fi)
$(if [ -n "${MARIADB_USER:-}" ]; then printf "CREATE USER IF NOT EXISTS '%s'@'%%' IDENTIFIED BY '%s';\nGRANT ALL PRIVILEGES ON \`%s\`.* TO '%s'@'%%';\n" "${MARIADB_USER}" "${MARIADB_PASSWORD:-}" "${MARIADB_DATABASE:-*}" "${MARIADB_USER}"; fi)
$(if [ -n "${MARIADB_USER:-}" ]; then printf "CREATE USER IF NOT EXISTS '%s'@'localhost' IDENTIFIED BY '%s';\nGRANT ALL PRIVILEGES ON \`%s\`.* TO '%s'@'localhost';\n" "${MARIADB_USER}" "${MARIADB_PASSWORD:-}" "${MARIADB_DATABASE:-*}" "${MARIADB_USER}"; fi)
FLUSH PRIVILEGES;
SQL
  kill "$init_pid"
  wait "$init_pid" 2>/dev/null || true
  trap - EXIT
fi

if [ "$data_action" = "fail" ]; then
  echo "MariaDB data-directory validation failed" >&2
  exit 1
fi

# Bootstrap is a first-start concern. Once this datadir has been initialized,
# never force --wsrep-new-cluster during a normal restart or rejoin.
if [ "${first_boot:-false}" = "true" ]; then
  touch "$datadir/.elera-supervisor-initialized"
fi

exec node /app/src/main.mjs
