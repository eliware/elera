# Release notes

## 0.1.2 — fail-closed data-directory hardening

Patch release focused on preventing accidental MariaDB initialization or
mutation of persistent data during ordinary startup.

### Security and runtime

- Reject missing, non-directory, non-writable, empty, partially initialized,
  stale, or suspicious data directories before MariaDB starts.
- Permit `mariadb-install-db` only for an explicitly requested bootstrap on a
  genuinely empty directory.
- Reject bootstrap mode when an existing MariaDB system database is present.
- Avoid modifying existing data directories during ordinary restart or rejoin.
- Add focused regression coverage for all data-directory decisions.
- Document the runtime contract, release evidence requirements, known
  limitations, and rollback procedure.

This release still requires DevOps SBOM, vulnerability, signing, independent
digest verification, and real Galera failure-test evidence before production
approval.

## 0.1.1 — non-root container hardening

Patch release focused on reducing container privileges while preserving the
existing supervisor and MariaDB startup behavior.

### Security and runtime

- Run the production and development images as the non-root `mysql` user.
- Pre-create and assign ownership of `/run/mysqld`, `/var/lib/mysql`, and
  `/etc/elera` during image construction.
- Use MariaDB normal root authentication during first-time datadir setup so
  initialization can complete without an operating-system root process.
- Document the non-root runtime and persistent-volume ownership requirements.

## 0.1.0 — baseline supervisor

Initial development release of the Elera MariaDB supervisor container and
control plane.

### Supervisor runtime

- Node.js supervisor process manages the MariaDB child process lifecycle.
- Graceful shutdown and drain handling stop admission of new work, allow
  active database work to finish, and terminate MariaDB cleanly.
- `/healthz` and `/readyz` expose liveness and readiness independently.
- Cached local observations avoid issuing a new SQL probe for every request.
- Structured lifecycle, signal, error, and operational logging is provided
  through `@eliware/common`.

### Cluster and routing

- Standalone and three-node Elera/Galera operating modes are supported by the
  container configuration.
- Peer observations, quorum evaluation, node lifecycle state, and durable
  observation storage are represented as separate supervisor modules.
- Routing decisions produce connection bundles with ordered read and write
  candidates, application policy, weights, and expiry information.
- Routing updates can be consumed through an authenticated WebSocket event
  stream, with REST refresh available to clients as a fallback.
- The intended deployment uses HAProxy for HTTP supervisor traffic only;
  applications establish SQL connections directly to bundle endpoints.

### Control API

- Bearer-token authentication protects control-plane operations.
- Initialization and first-boot lifecycle endpoints are available for
  controlled setup.
- Cluster status, peer observations, quorum, traffic, drain, and routing
  resynchronization endpoints are available.
- Managed database/account operations expose declarative metadata and grant
  policy handling.
- Metadata, encrypted artifact, reconciliation, and restore-support endpoints
  provide the supervisor state required by the Elera ecosystem.
- Intent validation, state management, reconciliation, and MariaDB config
  rendering are separated into independently testable modules.

### Contracts and integration

- Routing-bundle and supervisor-intent JSON schemas and fixtures are included.
- The supervisor consumes the published `@eliware/elera-lib@0.1.0` package;
  no sibling checkout or local package copy is required.
- Docker Compose lab configuration covers three cluster nodes, a standalone
  restore target, HTTP HAProxy, backup workstation, and NAS simulator.
- Apache-2.0 licensing and third-party notices are included; bundled external
  software remains under its respective license.

This release establishes the baseline contracts and runtime structure. Galera
production bootstrapping, hardened secret-management policy, Kubernetes
deployment rollout, and later operational automation remain follow-up work.
