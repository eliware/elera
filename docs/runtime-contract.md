# Elera image runtime contract

## Identity and filesystem

The image runs as UID `100`, GID `101` (`mysql`). These paths must be writable
by that identity:

- `/var/lib/mysql` — persistent MariaDB data;
- `/run/mysqld` — MariaDB runtime sockets and state;
- `/tmp` — MariaDB/InnoDB temporary files when the root filesystem is read-only;
- `/var/lib/mysql/elera-state` — writable supervisor intent state and generated
  MariaDB configuration by default; `ELERA_CONFIG_STATE_DIR` may override it.
- `/etc/elera` — optional static configuration input; ConfigMap mounts may be
  read-only.

The root filesystem can be read-only when `/run/elera`, `/run/mysqld`, and
`/tmp` are provided as writable runtime mounts. The persistent data directory
must be a mounted,
dedicated filesystem in production. A missing, read-only, non-directory, empty
without bootstrap, partially initialized, stale, or otherwise suspicious data
directory causes startup to fail closed.

## Ports and probes

- `3306`: MariaDB client traffic.
- `4444`: Galera SST.
- `4567`: Galera replication.
- `4568`: Galera IST.
- `8080`: supervisor HTTP API and probes.

`/healthz` is a liveness endpoint and returns `200 ok` while the supervisor
process is alive. `/readyz` returns `200` only when MariaDB is accepting work
and the local readiness policy is satisfied; otherwise it returns `503`.
During cold recovery it remains `503` for `pending`, `collecting-evidence`,
`awaiting-quorum`, `cluster-unavailable`, and `blocked-ambiguous`.

Cold-recovery state is included in status responses as `recovery.state` and
uses `pending`, `collecting-evidence`, `awaiting-quorum`, `recovery-authorized`,
`bootstrapping`, `joining`, `cluster-unavailable`, or `blocked-ambiguous`.

## Startup and lifecycle

- First initialization: performed only by an explicit authenticated
  `elera-cli` operation; startup environment flags do not enable it.
- Ordinary restart: an initialized directory starts normally; no system-table
  initialization occurs.
- Rejoin: a valid existing Galera directory starts without
  `--wsrep-new-cluster`. Startup does not touch or add marker files to that
  existing directory.
- Bootstrap: explicit operator-controlled workflow only; it is never inferred
  from peer absence or readiness failure.
- Recovery: a controlled cold-start coordinator may recover automatically only
  after collecting quorum-backed evidence and acquiring a single-winner
  recovery lease. Ambiguous evidence remains blocked and requires an explicit
  operator-controlled recovery workflow.
- Shutdown lifecycle: the supervisor transitions through serving, draining,
  stopping, and stopped. On SIGTERM it marks readiness failed, removes itself
  from locally issued routes, broadcasts routing.drain, and lets
  supervisor-managed work settle before stopping MariaDB.
- The supervisor is not inline with direct application SQL connections.
  elera-lib must honor the drain event, stop assigning new work to the node,
  allow active operations to finish, and force-close remaining client
  connections at its configured drain deadline.
- MariaDB then receives SIGTERM and is allowed up to the configured shutdown
  timeout to exit normally. If it remains alive, the supervisor sends SIGKILL.
  This is separate from the client-library drain deadline.

`ELERA_CONFIG_STATE_DIR` overrides the default state directory
`/var/lib/mysql/elera-state`.
The supervisor writes `active.intent.json`, `last-known-good.intent.json`, and
`mariadb.cnf` there. Startup fails if that directory is unavailable or
unwritable.

Normal startup never runs `mariadb-install-db`, erases data, or reinitializes a
directory. A non-empty directory without the MariaDB `mysql` system database is
rejected. The entrypoint does not attempt to repair stale or corrupted data.
First initialization is an explicit authenticated `elera-cli` workflow and is
never enabled by container environment variables.

Failed SST/IST, non-Primary state, stale/corrupt data, and insufficient or
read-only storage result in readiness failure or process failure and require
operator-controlled recovery unless a valid, quorum-backed cold-start decision
authorizes exactly one winner. Provider-level automatic primary recovery is
disabled to prevent concurrent bootstrap attempts.

## Configuration and secrets

MariaDB/Galera configuration is generated from the supervisor intent and
non-secret environment configuration. Runtime passwords are supplied through
the runtime Secret and are not placed in command-line arguments, ConfigMaps,
or generated configuration. First initialization consumes the values through
SQL stdin; they are not intentionally logged or written to temporary files.
Explicit initialization uses local Unix-socket authentication and the fixed `elera_meta` database. No root password or application database credentials are required in the runtime environment.

The lab Secret must be distinct from production credentials. The claims above
describe the intended local image behavior; registry SBOM/scanning and real
Galera failure evidence remain release/lab evidence items, not image-unit-test
claims.

The current local image has not cleared vulnerability release review. Docker
Scout reports unresolved critical/high findings in the Bookworm base and
installed packages; publication requires a DevOps remediation or documented
risk-acceptance decision.
### Client-facing SQL address

Node identity is derived from `hostname -f` and `hostname -i` at startup. Persisted intent is the sole source of cluster topology after initialization; cluster topology is established only through the explicit initialization workflow.

### Pending initialization

The explicit pending-initialization path uses `/run/mysqld/pending-init.sock`
for its private MariaDB process and readiness probe. This temporary socket is
not exposed as a service port. Initialization is entered only through the
explicit authenticated workflow; ordinary startup does not create, erase, or
repair a data directory.
