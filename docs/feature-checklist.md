# Elera Ecosystem Feature Checklist

Work proceeds as parallel vertical slices across `elera-lib`, the supervisor,
and `elera-cli`. Check an item only when it is implemented, tested, and
documented. Every sprint ends with an interoperability smoke test.

## Sprint 0 — Repository and contract baseline [complete]

- [x] Bootstrap all three Node.js 26/ESM repositories with CI, Knit, licenses, and tests.
- [x] Establish local linking between supervisor, `elera-cli`, and `elera-lib`.
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
- [x] Use `elera-lib` for the local SQL connection.
- [x] Provide `/healthz` and `/readyz` with one-second cached health checks.

### CLI and interoperability

- [x] Provide `health`, `ready`, `status`, stable exits, and SQL smoke support.
- [x] Verify library, supervisor, CLI, and real MariaDB interoperability.

### Sprint 1 certification evidence

- Production image builds from the workspace parent context with the sibling
  `elera-lib` included.
- The standalone supervisor exposes `/healthz` before MariaDB is ready and
  issues an advertised `elera-single:3306` bundle to remote consumers.
- `elera-cli sql-smoke` passes from the separate `backup-dev` container through
  the supervisor lease endpoint to MariaDB.
- Local tests pass at 100×4 coverage with zero lint warnings; the pushed
  supervisor CI run passed on both Ubuntu and Windows.
- The GitHub Actions Node.js 20 action warning is informational only; it does
  not affect the Sprint 1 gates.

## Sprint 2 — GitOps intent, rendering, and first boot

### Shared contract

- [x] Define the versioned supervisor intent schema: cluster members, MariaDB settings, routing policy, and drain policy.
- [x] Keep tokens, passwords, TLS inputs, and other sensitive values in separate GitOps Secrets.
- [x] Define desired/active hashes and change classes: no-op, reload, restart, or unsafe.

### `elera-lib`

- [x] Add generic administrative SQL and transaction-safe migration primitives.
- [x] Keep supervisor and CLI policy out of the public library API.

### Supervisor

- [x] Validate intent and atomically render standardized MariaDB/Elera files.
- [x] Retain a last-known-good rendered copy and leave active state unchanged on failure.
- [x] Reconcile config changes and expose desired/effective/status plus plan/apply operations.
- [x] Make standalone first boot idempotent and reject unsafe bootstrap changes.

### CLI and interoperability

- [x] Add config inspection, plan, apply, and verify commands.
- [x] Run first boot from supervisor intent against standalone Docker MariaDB.
- [x] Verify no-op, reload, restart, invalid-config, and rollback behavior across all three repos.

### Sprint 2 implementation evidence

- The standalone lab generates `/etc/elera/mariadb.cnf` from the validated intent
  before launching MariaDB and reports `/readyz` 200 after SQL recovery.
- Repeated initialization applies succeed without duplicate-user/database errors.
- Intent plan/apply/verify endpoints return stable hashes; unsafe membership
  changes are rejected with `409 UNSAFE_INTENT_CHANGE`.
- Supervisor, `elera-lib`, and `elera-cli` test suites and lint pass; reload,
  restart, invalid-input, and write-failure coverage is exercised by the
  reconciliation, API, CLI, and state-layer tests.

### Sprint 2 certification

Sprint 2 is complete. The contract, supervisor rendering/reconciliation,
standalone first boot, generic library primitives, CLI workflows, and their
verification gates are implemented and tested. Elera cluster formation and
metadata provisioning remain intentionally deferred to Sprints 3 and 4.

Post-rebrand certification evidence: the Elera supervisor workflow passed on
both Ubuntu and Windows in run 33036380785; the Elera CLI entrypoint correction
passed on both platforms in run 33036858246; and the Elera library rebrand
workflow passed on both platforms in run 33036762276.

## Sprint 3 — `elera_meta` metadata foundation

### `elera-lib`

- [x] Support generic schema migration, transaction, and verification operations.

### Supervisor

- [x] Initialize replicated `elera_meta` idempotently and verify volume/schema state before mutation.
- [x] Create optional bootstrap/SST and health accounts safely and expose metadata status, initialize, and verify operations.

### CLI and interoperability

- [x] Implement `init`, metadata initialize, and metadata verify commands.
- [x] Require root-token confirmation for first-boot mutations.
- [x] Verify repeated initialization on standalone and Elera nodes.

### Sprint 3 certification

Sprint 3 is complete: generic migration primitives, idempotent `elera_meta`
initialization, metadata status/initialize/verify APIs, optional SST/health
account provisioning, explicit CLI confirmation, and mirrored tests are
implemented. All three repositories pass 100×4 coverage and zero-warning lint.

## Sprint 4 — Elera lifecycle, observations, and quorum

### `elera-lib`

- [x] Accept supervisor-selected direct node sets without embedding Elera policy.
- [x] Preserve safe failover only within a valid, versioned route bundle.

### Supervisor

- [x] Implement bootstrap eligibility, bootstrap, join, leave, and recovery planning.
- [x] Exchange authenticated health/topology observations between supervisors.
- [x] Form quorum; reject stale, contradictory, or unsafe observations.
- [x] Track synced state, primary component, node identity, health, load, and drain state.
- [x] Persist observations across supervisor restarts when `ELERA_OBSERVATION_STATE_PATH` is configured.

### CLI and interoperability

- [x] Implement cluster status, bootstrap, join, leave, and recovery commands.
- [ ] Bootstrap and inspect a three-node Docker Elera cluster.
- [ ] Verify topology and direct `3306` connectivity from every supervisor.

## Sprint 5 — Managed databases, identities, and scoped credentials

### `elera-lib`

- [ ] Accept credential leases through a generic injected provider.
- [ ] Replace credentials and recycle pools without logging secrets.

### Supervisor

- [ ] Store application databases, identities, accounts, grants, token metadata, and application mappings in `elera_meta`.
- [ ] Provision runtime, readonly, migration, reporting, and admin identities idempotently.
- [ ] Generate, rotate, revoke, and verify credentials and grants; exclude system schemas.

### CLI and interoperability

- [ ] Implement database, identity, account, grant, token, and credential commands.
- [ ] Map scoped bearer tokens to applications/identities.
- [ ] Verify actual MariaDB privileges through API, CLI, and library connections.

## Sprint 6 — Routing decisions and REST bundles

### `elera-lib`

- [ ] Consume bundles containing credentials, database, ordered writer candidates, and reader candidates.
- [ ] Send writes only to assigned writer candidates and reads to permitted readers.
- [ ] Preserve transaction pinning and refresh expired bundles through REST.

### Supervisor

- [ ] Assign per-application writer order through quorum decisions.
- [ ] Recalculate routes from synchronization, health, load, weights, and drain state at approximately one-second intervals.
- [ ] Use hysteresis/recovery windows to avoid writer thrashing.
- [ ] Expose bundle, lease, refresh, and route inspection endpoints.

### CLI and interoperability

- [ ] Inspect writer assignments, route candidates, and bundle versions.
- [ ] Start an application using only endpoint, scoped token, database, and identity.
- [ ] Verify writes follow assigned writers and reads use allowed readers.

## Sprint 7 — WebSocket events and graceful draining

### `elera-lib`

- [ ] Open an authenticated WebSocket stream through the HTTP VIP.
- [ ] Apply versioned route, writer, reader, drain, recovery, and credential events.
- [ ] Reconnect with backoff; use REST bundle refresh when unavailable.
- [ ] Detect event gaps and resynchronize by bundle version.
- [ ] Stop new work, finish active transactions, and recycle affected pools during drain.

### Supervisor

- [ ] Publish meaningful versioned changes plus heartbeat/ping-pong liveness.
- [ ] Expose routing stream and resync endpoints while keeping the API stateless.
- [ ] Publish drain events before normal graceful MariaDB shutdown.

### CLI and interoperability

- [ ] Keep REST for management/recovery and add node/application drain commands.
- [ ] Verify approximately one-second updates, WebSocket loss fallback, and rolling drains.

## Sprint 8 — Reconciliation and metadata-first restore

### `elera-lib`

- [ ] Provide generic streaming and verification hooks for native dump/restore commands.
- [ ] Verify credentials, privileges, schema, data, and application access without JSON dump transport.

### Supervisor

- [ ] Add reconcile plan/apply/verify operations for metadata, accounts, grants, and routes.
- [ ] Restore `elera_meta` and logical account state independently of system schemas.

### CLI and interoperability

- [ ] Implement reconcile and restore plan/apply/verify commands.
- [ ] Continue using native `mariadb-dump` and `mariadb` streams.
- [ ] Complete metadata-first restore in Docker Desktop without raw system-schema files.

## Sprint 9 — GitOps hardening and optional encrypted artifacts

### `elera-lib`

- [ ] Materialize short-lived credentials and artifacts with deterministic cleanup.
- [ ] Never expose age keys or plaintext secret material through logs or generic library APIs.

### Supervisor

- [ ] Treat GitOps Secrets/operator artifacts as the initial home for SSH, `known_hosts`, TLS, and backup inputs.
- [ ] Add age-encrypted artifact storage only when restore workflows demonstrate the need; never store private keys in `elera_meta`.

### CLI and interoperability

- [ ] Add optional artifact CRUD, verification, and materialization commands.
- [ ] Verify encrypted artifacts survive backup/restore and cannot be returned as plaintext accidentally.

## Sprint 10 — VyOS HTTP migration and legacy removal

### Supervisor and `elera-lib`

- [ ] Remove transitional agent-check listeners `33060`/`33070` after HTTP routing is validated.
- [ ] Validate direct application-to-node `3306` access and NetworkPolicies.

### CLI and operations

- [ ] Provide migration diagnostics and rollback checks.
- [ ] Verify graceful drains while changing VyOS routing.

### VyOS interoperability

- [ ] Configure HAProxy as an HTTP-only supervisor load balancer.
- [ ] Validate `/healthz`, `/readyz`, WebSocket upgrades/timeouts, and stateless API failover.
- [ ] Remove MySQL HAProxy frontends, `agent-check`, `elera-check.exe`, installer, and systemd units.

## Sprint 11 — Application migration and release

### All repositories

- [ ] Migrate an internal application from `@eliware/mysql` to generic `@eliware/elera-lib`.
- [ ] Validate writer assignment, reader failover, supervisor failure, event-stream fallback, and graceful drains.
- [ ] Replace local links with released package versions and verify package/image contents.

### Release interoperability

- [ ] Publish packages and the supervisor image only from authorized `v*` tags.
- [ ] Complete a production-like three-node acceptance run and document rollback.
