# Galera Ecosystem Feature Checklist

Work proceeds as parallel vertical slices across `galera-lib`, the supervisor,
and `galera-cli`. Check an item only when it is implemented, tested, and
documented. Every sprint ends with an interoperability smoke test.

## Sprint 0 — Repository and contract baseline [complete]

- [x] Bootstrap all three Node.js 26/ESM repositories with CI, Knit, licenses, and tests.
- [x] Establish local linking between supervisor, `galera-cli`, and `galera-lib`.
- [x] Define `/api/v1`, response envelopes, error handling, and initial scope vocabulary.
- [x] Establish `elera_meta` as the authoritative metadata database name.
- [x] Add machine-readable schemas and shared contract fixtures to all three repositories.
- [x] Add contract verification to all three repositories and CI.

## Sprint 1 — Local SQL and service lifecycle [complete]

### Library

- [x] Implement generic profiles, routing, pool health, quarantine, transaction pinning, TLS, and cleanup.
- [x] Never retry mutations with unknown delivery status.

### Supervisor

- [x] Start and own MariaDB as PID child with bounded startup and graceful shutdown.
- [x] Use `galera-lib` for the local SQL connection.
- [x] Provide `/healthz` and `/readyz` with one-second cached health checks.

### CLI and interoperability

- [x] Provide `health`, `ready`, `status`, stable exits, and SQL smoke support.
- [x] Verify library, supervisor, CLI, and real MariaDB interoperability.

## Sprint 2 — GitOps supervisor configuration and first boot

### Shared configuration contract

- [ ] Define a versioned supervisor intent schema for GitOps ConfigMaps.
- [ ] Keep tokens, passwords, TLS inputs, and other sensitive values in separate Secrets.
- [ ] Render standardized MariaDB/Galera files from validated supervisor intent.
- [ ] Track desired and active hashes; retain a last-known-good rendered copy.
- [ ] Write generated files atomically and leave active state untouched on failure.
- [ ] Classify changes as no-op, graceful reload, controlled restart, or unsafe.

### Library

- [ ] Add generic administrative SQL and transaction-safe migration primitives.

### Supervisor

- [ ] Reconcile ConfigMap changes without hand-authored MariaDB files.
- [ ] Expose config desired/effective/status and reconcile plan/apply operations.
- [ ] Verify generated configuration before MariaDB activation.
- [ ] Make first boot idempotent and reject unsafe bootstrap configuration changes.

### CLI and interoperability

- [ ] Add config inspection/reconcile commands.
- [ ] Run first boot from supervisor intent against standalone Docker MariaDB.
- [ ] Verify no-op, reload, restart, invalid-config, and last-known-good behavior.

## Sprint 3 — `elera_meta` metadata foundation

### Library

- [ ] Support the generic SQL operations required for metadata migrations.

### Supervisor

- [ ] Initialize the replicated `elera_meta` schema idempotently.
- [ ] Verify volume state and metadata schema before mutation.
- [ ] Create required bootstrap/SST accounts safely.
- [ ] Expose metadata status, initialize, and verify operations.

### CLI and interoperability

- [ ] Implement `init`, metadata initialize, and metadata verify commands.
- [ ] Require root-token confirmation for first-boot mutations.
- [ ] Verify repeated initialization is idempotent on standalone and Galera nodes.

## Sprint 4 — Galera cluster lifecycle and quorum

### Library

- [ ] Accept supervisor-selected direct node sets without embedding Galera policy.
- [ ] Preserve safe connection failover within a valid bundle.

### Supervisor

- [ ] Implement bootstrap eligibility, bootstrap, join, leave, and recovery planning.
- [ ] Exchange authenticated health/topology observations between supervisors.
- [ ] Form quorum and reject stale, contradictory, or unsafe observations.
- [ ] Track Galera synced state, primary component, node identity, and load.

### CLI and interoperability

- [ ] Implement `cluster status`, `bootstrap`, `join`, `leave`, and recovery.
- [ ] Bootstrap and inspect a three-node Docker Galera cluster.
- [ ] Verify topology and direct `3306` connectivity from every supervisor.

## Sprint 5 — Managed databases, identities, and credentials

### Library

- [ ] Accept credential leases through a generic injected provider.
- [ ] Replace credentials and recycle pools without exposing secrets in logs.

### Supervisor

- [ ] Store application databases, identities, accounts, grants, and token metadata in `elera_meta`.
- [ ] Provision runtime, readonly, migration, reporting, and admin identities idempotently.
- [ ] Generate, rotate, revoke, and verify application credentials and grants.
- [ ] Keep system schemas outside application management.

### CLI and interoperability

- [ ] Implement database, identity, account, grant, and credential commands.
- [ ] Create scoped application tokens mapped to identities.
- [ ] Verify actual MariaDB privileges through API, CLI, and library connections.

## Sprint 6 — Per-application writer assignments and REST bundles

### Library

- [ ] Consume bundles containing credentials, database, ordered writer candidates, and reader candidates.
- [ ] Send writes only to supervisor-assigned writer candidates.
- [ ] Use permitted readers for reads while preserving transaction pinning.
- [ ] Refresh expired/exhausted bundles through REST without inventing writer assignments.

### Supervisor

- [ ] Assign one logical writer order per application/identity through quorum decisions.
- [ ] Recalculate assignments from synchronization, health, load, weights, and drain state.
- [ ] Use hysteresis/recovery windows to avoid writer thrashing.
- [ ] Expose `GET /api/v1/routing/bundle` and credential lease/refresh operations.

### CLI and interoperability

- [ ] Inspect writer assignments and bundle versions.
- [ ] Start an application using only endpoint, scoped token, database, and identity.
- [ ] Verify writes follow the assigned writer and reads may use allowed readers.

## Sprint 7 — WebSocket routing events and graceful draining

### Library

- [ ] Open an authenticated WebSocket routing stream through the HTTP VIP.
- [ ] Apply versioned snapshots, writer changes, reader changes, drain, recovery, and credential events.
- [ ] Reconnect with backoff and use REST bundle refresh when the stream is unavailable.
- [ ] Stop new work on draining nodes, finish active transactions, and recycle affected pools.
- [ ] Detect event gaps and resynchronize by bundle version.

### Supervisor

- [ ] Evaluate health/load approximately once per second.
- [ ] Publish only meaningful versioned changes plus heartbeat/ping-pong liveness.
- [ ] Expose `/api/v1/routing/stream` and `/api/v1/routing/resync`.
- [ ] Forward management writes to the elected writer while keeping the public API stateless.
- [ ] Publish drain events before graceful MariaDB shutdown.

### CLI and interoperability

- [ ] Keep REST as the CLI interface for management and recovery operations.
- [ ] Add node/application drain commands.
- [ ] Verify sub-second routing updates, WebSocket loss fallback, and rolling drains.

## Sprint 8 — Reconciliation and metadata-first restore

### Supervisor and library

- [ ] Add reconcile plan/apply/verify operations for databases, accounts, grants, and routing assignments.
- [ ] Restore `elera_meta` and logical account state independently of system schemas.
- [ ] Verify credentials, privileges, schema, data, and application access.

### CLI

- [ ] Implement reconcile and restore plan/apply/verify commands.
- [ ] Continue using native `mariadb-dump` and `mariadb` streams, never JSON dump transport.

### Interoperability

- [ ] Complete metadata-first restore in Docker Desktop.
- [ ] Confirm restoration does not depend on raw `mysql`, `sys`, performance-schema, or information-schema files.

## Sprint 9 — Deferred encrypted artifacts and GitOps hardening

- [ ] Keep GitOps Secrets/operator artifacts as the initial home for SSH, `known_hosts`, TLS files, and backup artifacts.
- [ ] Add age-encrypted artifact storage only if restore workflows demonstrate the need.
- [ ] Never store age private keys or plaintext secret material in `elera_meta`.
- [ ] Add optional artifact CRUD, verification, and CLI materialization with deterministic cleanup.

## Sprint 10 — VyOS migration and legacy removal

- [ ] Configure VyOS HAProxy as an HTTP-only supervisor load balancer.
- [ ] Check `/healthz` and `/readyz` through HAProxy and validate WebSocket upgrades/timeouts.
- [ ] Remove MySQL HAProxy frontends, `agent-check`, `galera-check.exe`, installer, and systemd units.
- [ ] Remove transitional supervisor listeners `33060` and `33070`.
- [ ] Validate direct application-to-node `3306` access and NetworkPolicies.

## Sprint 11 — Migration and release

- [ ] Migrate an internal application from `@eliware/mysql` to `@eliware/galera-lib`.
- [ ] Validate writer assignment, reader failover, supervisor failure, and graceful drains.
- [ ] Publish packages and the supervisor image only from authorized `v*` tags.
- [ ] Replace local links with released versions and verify package/image contents.
