# Galera Ecosystem Feature Checklist

Work is organized as parallel vertical slices. Each sprint advances
`galera-lib`, the supervisor, and `galera-cli` together where applicable, with
an interoperability smoke test before the sprint is considered complete.
Check an item only when it is implemented, tested, and documented.

## Sprint 0 — Repository and contract baseline

- [x] Bootstrap all three repositories with Node.js 26, native ESM, tests, CI, Knit validation, documentation, licenses, and lockfiles.
- [x] Establish local development linking between supervisor, `galera-cli`, and `galera-lib`.
- [x] Define API version `/api/v1` and shared success, operation, and error envelopes.
- [x] Define `primary` and `balanced` as routing policies rather than SQL permissions.
- [x] Define SQL scopes: `connect`, `read`, `write`, `schema`, `execute`, and `admin`.
- [ ] Add machine-readable schemas and shared contract fixtures to all three repositories.
- [ ] Add contract compatibility/version validation to all three repositories.

## Sprint 1 — Bundle, configuration, and credential foundations

### `galera-lib`

- [x] Validate primary/balanced profiles, ports, pool limits, timeouts, and TLS options.
- [x] Support static connection profiles and static routing bundles.
- [x] Add a generic credential-provider interface.
- [x] Add typed declarations, structured errors, redaction, and lifecycle cleanup.
- [x] Add primary/balanced routing, transaction pinning, and conservative query classification.

### Supervisor

- [x] Define and validate connection-bundle responses.
- [x] Expose effective non-secret configuration needed by clients.
- [x] Add initial credential and route policy models.
- [x] Add authenticated credential-lease contract stubs.

### `galera-cli`

- [x] Add shared configuration for supervisor endpoint, bearer token, identity, and database.
- [x] Add connection-bundle and credential-lease client models.
- [x] Add safe configuration validation and secret redaction.

### Interoperability

- [x] Supervisor emits a fixture bundle accepted by `galera-lib`.
- [x] `galera-cli` requests and validates the same bundle.
- [x] Smoke test direct SQL connection to the persistent MariaDB container.

## Sprint 2 — Local SQL behavior and supervisor health

### `galera-lib`

- [ ] Implement pool health checks and route health state.
- [ ] Implement connection retry and temporary node quarantine.
- [ ] Never automatically retry mutations with unknown delivery status.
- [ ] Add optional session initialization and causal-consistency settings.
- [ ] Add TLS certificate and client-key support.

### Supervisor

- [ ] Make MariaDB child ownership and shutdown deterministic.
- [ ] Make startup and readiness sequencing bounded.
- [ ] Use `galera-lib` for the supervisor’s local SQL connection.
- [x] Expose `/healthz` and `/readyz`.
- [x] Cache health queries for one second.

### `galera-cli`

- [ ] Implement `health`, `ready`, and `status` commands.
- [ ] Use `galera-lib` for CLI SQL smoke operations.
- [ ] Implement stable exit codes and safe output modes.

### Interoperability

- [ ] Verify library health against the real MariaDB test container.
- [ ] Verify supervisor readiness and CLI health/ready output agree.
- [ ] Verify shutdown leaves no leaked SQL pools or child processes.

## Sprint 3 — First boot and metadata initialization

### `galera-lib`

- [ ] Add generic administrative database execution primitives.
- [ ] Add transaction-safe migration helpers without Galera-specific policy.

### Supervisor

- [x] Expose initialization inspection, planning, apply, and verification.
- [ ] Initialize the replicated `galera_cli` metadata schema idempotently.
- [ ] Verify volume state before first-boot mutation.
- [ ] Create required bootstrap/SST accounts safely.
- [ ] Add metadata status and verification endpoints.

### `galera-cli`

- [ ] Implement `init`.
- [ ] Implement metadata initialization and verification commands.
- [ ] Support root-token confirmation for first-boot operations.

### Interoperability

- [ ] Initialize metadata through the CLI against a standalone container.
- [ ] Re-run initialization and confirm it is idempotent.
- [ ] Verify metadata access through `galera-lib`.

## Sprint 4 — Galera lifecycle and topology

### `galera-lib`

- [ ] Accept supervisor-selected node sets and weights without embedding Galera policy.
- [ ] Refresh expired or exhausted bundles through an injected provider.
- [ ] Maintain safe local connection failover within a valid bundle.

### Supervisor

- [x] Expose bootstrap eligibility and planning.
- [x] Expose explicit bootstrap and readiness waiting.
- [ ] Add topology inspection.
- [ ] Add join, leave, and total-cluster-loss recovery planning/execution.
- [ ] Reject unsafe or ambiguous bootstrap states.

### `galera-cli`

- [ ] Implement `cluster status`.
- [ ] Implement `cluster bootstrap`.
- [ ] Implement cluster join, leave, and recovery commands.

### Interoperability

- [ ] Bootstrap a three-node Docker Galera cluster through the CLI.
- [ ] Retrieve topology and connection bundles from every supervisor node.
- [ ] Verify direct connections to eligible nodes.

## Sprint 5 — Authoritative databases, identities, accounts, and grants

### `galera-lib`

- [ ] Support the generic SQL operations required by metadata reconciliation.
- [ ] Support credential replacement without exposing credentials in logs.

### Supervisor

- [ ] Store managed application databases in `galera_cli`.
- [ ] Store managed identities and purposes: runtime, readonly, migration, reporting, and admin.
- [ ] Provision databases idempotently.
- [ ] Provision accounts and generate strong credentials.
- [ ] Reconcile structured grants.
- [ ] Verify database, account, and grant desired state.
- [ ] Rotate and revoke managed accounts.
- [ ] Keep system schemas outside application management.

### `galera-cli`

- [ ] Implement database provision/list/verify commands.
- [ ] Implement account provision/list/show commands.
- [ ] Implement account rotate/revoke/verify commands.
- [ ] Implement structured grant commands.

### Interoperability

- [ ] Provision one application with runtime, readonly, and migration identities.
- [ ] Verify each identity’s actual MariaDB privileges.
- [ ] Verify the same identities through supervisor API, CLI, and library connections.

## Sprint 6 — Scoped tokens and credential leases

### `galera-lib`

- [ ] Implement supervisor credential-provider integration.
- [ ] Request credentials and routes without application-managed passwords.
- [ ] Cache valid credentials in memory and refresh before expiry.
- [ ] Continue existing connections during temporary supervisor outages.
- [ ] Refresh when a bundle expires or all candidates fail.

### Supervisor

- [ ] Store only token hashes.
- [ ] Create, inspect, rotate, revoke, and expire scoped tokens.
- [ ] Bind tokens to resources and one or more managed identities.
- [ ] Implement credential lease issuance, refresh, and revocation.
- [ ] Return direct `primary` and `balanced` routes with weights and expiry.
- [ ] Prevent application tokens from performing root operations.

### `galera-cli`

- [ ] Implement token create/list/rotate/revoke commands.
- [ ] Implement credential lease and refresh commands.
- [ ] Never print credentials unless explicitly requested.

### Interoperability

- [ ] Create an application token mapped to a runtime identity.
- [ ] Start `galera-lib` using only supervisor endpoint, token, database, and identity.
- [ ] Verify the library receives a valid bundle and connects without `MYSQL_PASSWORD`.
- [ ] Rotate the managed credential and verify refresh behavior.

## Sprint 7 — Supervisor synchronization and routing decisions

### `galera-lib`

- [ ] Consume supervisor-provided weights and route sets.
- [ ] Quarantine failed bundle nodes locally without inventing eligibility policy.
- [ ] Re-request a bundle after expiry, exhaustion, or explicit refresh.

### Supervisor

- [ ] Add authenticated supervisor health observations.
- [ ] Add authenticated topology exchange.
- [ ] Add node identity, sequence, timestamp, and observation expiry.
- [ ] Exchange readiness, Galera state, eligibility, and weight.
- [ ] Reject stale, contradictory, or unsafe observations.
- [ ] Keep local safety checks authoritative.

### `galera-cli`

- [ ] Add topology and routing-bundle inspection commands.
- [ ] Add reconciliation diagnostics for stale or conflicting observations.

### Interoperability

- [ ] Stop one node and verify supervisors converge on its ineligibility.
- [ ] Recover the node and verify it is reintroduced only after readiness.
- [ ] Verify clients continue using valid bundle entries during convergence.

## Sprint 8 — Encrypted artifacts and GitOps

### `galera-lib`

- [ ] Provide generic secure credential material handling for consumers.
- [ ] Ensure credentials and TLS keys are absent from logs and diagnostics.

### Supervisor

- [ ] Store age-encrypted ciphertext and key-version metadata.
- [ ] Add encrypted artifact CRUD and verification endpoints.
- [ ] Store credential, SSH, `known_hosts`, TLS, backup, and GitOps metadata.
- [ ] Never store age private keys in MariaDB.

### `galera-cli`

- [ ] Add age-key loading and local decryption.
- [ ] Add secret/artifact put/get/verify commands.
- [ ] Materialize temporary native-command credentials with restrictive permissions.
- [ ] Clean up temporary credentials deterministically.
- [ ] Add GitOps synchronization support.

### Interoperability

- [ ] Store an encrypted application credential artifact.
- [ ] Retrieve and decrypt it locally with the configured age key.
- [ ] Verify the supervisor never receives the age private key.

## Sprint 9 — Reconciliation and backup/restore

### `galera-lib`

- [ ] Verify restored credentials and grants through direct SQL.
- [ ] Support reconnecting after account rotation or restore.

### Supervisor

- [ ] Add reconcile plan/apply/verify endpoints.
- [ ] Add metadata restore plan/apply/verify endpoints.
- [ ] Add account restore plan/apply/verify endpoints.
- [ ] Track redacted long-running operations.

### `galera-cli`

- [ ] Implement reconcile plan/apply/verify.
- [ ] Restore metadata before application databases.
- [ ] Recreate databases, accounts, and grants logically.
- [ ] Use native `mariadb-dump` and `mariadb` for data streams.
- [ ] Verify schema, data, credentials, privileges, and application access.

### Interoperability

- [ ] Perform a complete metadata-first restore in Docker Desktop.
- [ ] Confirm no restore depends on raw `mysql`, `sys`, or performance-schema files.
- [ ] Confirm dump streams never pass through JSON APIs.

## Sprint 10 — VyOS migration and legacy removal

- [ ] Configure VyOS HAProxy as HTTP-only supervisor load balancer.
- [ ] Configure HAProxy checks against `/healthz` and `/readyz`.
- [ ] Keep supervisor nodes behind a stable HAProxy/VRRP endpoint.
- [ ] Remove MySQL HAProxy frontends and backends.
- [ ] Remove `agent-check` configuration.
- [ ] Remove supervisor TCP listeners `33060` and `33070`.
- [ ] Remove `galera-check.exe`.
- [ ] Remove checker environment, systemd units, installer, and post-commit rewrite logic.
- [ ] Validate direct application-to-node port `3306` access and NetworkPolicies.
- [ ] Validate HAProxy supervisor failover.

## Sprint 11 — Migration and release

- [ ] Migrate one internal application from `@eliware/mysql` to `@eliware/galera-lib`.
- [ ] Validate runtime, balanced, migration, and readonly identities.
- [ ] Validate node failure and bundle-based connection failover.
- [ ] Validate supervisor failure while existing SQL connections remain active.
- [ ] Publish `@eliware/galera-lib` only from an authorized `v*` tag.
- [ ] Publish `@eliware/galera-cli` only from an authorized `v*` tag.
- [ ] Replace local links with released package versions after publication.
- [ ] Build/publish the supervisor container only from an authorized `v*` tag.
- [ ] Verify package/image contents, checksums, audit, tests, lint, typecheck, and 100×4 coverage.
