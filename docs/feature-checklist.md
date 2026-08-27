# Galera Ecosystem Feature Checklist

This is the implementation checklist for the supervisor, `@eliware/galera-lib`,
and `galera-cli`. Check items only when implemented, tested, and documented.

## Sprint 0 — Contracts and repository baseline

- [x] Define the supervisor API base path as `/api/v1`.
- [x] Define shared success, operation, and error response envelopes.
- [x] Define `primary` and `balanced` as routing policies, not SQL permissions.
- [x] Define SQL scopes: `connect`, `read`, `write`, `schema`, `execute`, `admin`.
- [x] Define management scopes for tokens, databases, accounts, credentials, metadata, cluster, and backup operations.
- [x] Define database, identity, token, grant, lease, route, artifact, and operation models.
- [x] Define metadata-first restore order.
- [x] Bootstrap all three repositories with Node.js 26, native ESM, documentation, tests, lockfiles, and CI.
- [x] Locally link `galera-lib` into the supervisor and `galera-cli`.
- [ ] Add shared machine-readable API schemas.
- [ ] Add shared contract fixtures consumed by all three repositories.
- [ ] Add contract compatibility/version validation.

## Sprint 1 — `@eliware/galera-lib` SQL foundation

- [x] Create primary connection pool.
- [x] Create optional balanced connection pool.
- [x] Support explicit `primary`, `balanced`, and `auto` routing.
- [x] Route conservative standalone reads to the balanced pool.
- [x] Route mutations and ambiguous SQL to the primary pool by default.
- [x] Pin transactions to a primary connection.
- [x] Provide generic health checks.
- [x] Provide graceful pool shutdown.
- [x] Support dependency-injected MySQL drivers and loggers.
- [x] Redact credentials from configuration and error output.
- [ ] Validate ports, pool limits, timeouts, and TLS options.
- [ ] Add typed public declarations for the complete API.
- [ ] Add structured error types and error classification.
- [ ] Add connection-level retry and node quarantine for unexpired bundles.
- [ ] Never automatically retry mutations with unknown delivery status.
- [ ] Add credential-provider interface.
- [ ] Add credential refresh without exposing passwords to applications.
- [ ] Add routing-bundle client support.
- [ ] Add per-node pool balancing using supervisor-provided weights.
- [ ] Add bundle expiry, refresh, and exhaustion behavior.
- [ ] Add session initialization and causal-consistency options.
- [ ] Add TLS certificate and client-key support.

## Sprint 2 — Supervisor lifecycle and local service

- [x] Run MariaDB under the Node supervisor.
- [x] Expose `/healthz`.
- [x] Expose `/readyz`.
- [x] Cache health queries in memory for one second.
- [x] Share cached status across HTTP and transitional agent checks.
- [x] Register common error and signal handlers.
- [ ] Make MariaDB child-process ownership and shutdown fully deterministic.
- [ ] Make startup readiness sequencing explicit and bounded.
- [ ] Make bootstrap restart sequencing await actual MariaDB readiness.
- [ ] Ensure failed MariaDB startup terminates the supervisor cleanly.
- [ ] Add redacted `/api/v1/version`.
- [ ] Add redacted `/api/v1/config`.
- [ ] Add redacted `/api/v1/diagnostics`.
- [ ] Add metrics without secret or credential exposure.
- [ ] Make all mutating API operations idempotent.
- [ ] Add bounded operation timeouts and cancellation.

## Sprint 3 — First boot and Galera lifecycle

- [x] Expose initialization inspection.
- [x] Expose initialization planning.
- [x] Expose basic initialization apply.
- [x] Expose basic initialization verification.
- [x] Expose bootstrap eligibility.
- [x] Expose bootstrap planning.
- [x] Expose explicit Galera bootstrap.
- [x] Expose readiness waiting.
- [ ] Create an idempotent metadata schema initialization operation.
- [ ] Verify volume state before first-boot mutation.
- [ ] Create required Galera/SST service accounts safely.
- [ ] Add credential rotation for bootstrap-managed accounts.
- [ ] Add cluster topology inspection.
- [ ] Add normal node join planning and execution.
- [ ] Add graceful node leave.
- [ ] Add total-cluster-loss recovery planning.
- [ ] Add explicitly confirmed total-cluster-loss recovery.
- [ ] Reject bootstrap when a Primary component already exists.
- [ ] Reject bootstrap on ambiguous persistent state.
- [ ] Reject automatic bootstrap after temporary peer loss.

## Sprint 4 — Authoritative databases, identities, accounts, and grants

- [ ] Create the replicated `galera_cli` metadata database.
- [ ] Store managed application database definitions.
- [ ] Store managed identity definitions.
- [ ] Store account purposes such as runtime, readonly, migration, reporting, and admin.
- [ ] Provision application databases idempotently.
- [ ] Provision managed MariaDB accounts idempotently.
- [ ] Generate strong account passwords.
- [ ] Reconcile structured grants into MariaDB.
- [ ] Verify database definitions against MariaDB.
- [ ] Verify account definitions against MariaDB.
- [ ] Verify grants against MariaDB.
- [ ] Rotate managed account credentials.
- [ ] Revoke managed accounts safely.
- [ ] Keep account metadata separate from credential ciphertext.
- [ ] Exclude `mysql`, `sys`, `performance_schema`, and `information_schema` from application management.
- [ ] Remove arbitrary raw grant SQL from normal provisioning paths.
- [ ] Retain logical SQL import/export only for compatibility and recovery.

## Sprint 5 — Scoped token system

- [ ] Store only API token hashes.
- [ ] Create scoped bearer tokens.
- [ ] Bind tokens to explicit resources.
- [ ] Bind tokens to one or more managed identities.
- [ ] Support separate supervisor, CLI, runtime, migration, readonly, and reporting tokens.
- [ ] Rotate tokens without exposing historical plaintext.
- [ ] Revoke tokens immediately.
- [ ] Support token expiration.
- [ ] Record token usage metadata without secret material.
- [ ] Prevent application tokens from performing root operations.
- [ ] Keep `ROOT_TOKEN` outside the metadata database.
- [ ] Require explicit confirmation for root-level destructive operations.

## Sprint 6 — Credential leases and routing bundles

- [ ] Implement credential lease issuance.
- [ ] Implement credential lease refresh.
- [ ] Implement credential lease revocation.
- [ ] Validate token access to the requested database identity.
- [ ] Return short-lived managed MariaDB credentials.
- [ ] Return direct eligible node addresses and port `3306`.
- [ ] Return separate primary and balanced route sets.
- [ ] Return supervisor-calculated node weights.
- [ ] Return bundle version, refresh time, and expiry time.
- [ ] Exclude ineligible, stale, drained, or unsynced nodes.
- [ ] Prevent credentials from appearing in logs, diagnostics, or operations.
- [ ] Support encrypted credential envelopes where plaintext response is inappropriate.
- [ ] Make existing application connections survive temporary supervisor outages.

## Sprint 7 — Supervisor-to-supervisor synchronization

- [ ] Define authenticated supervisor health observations.
- [ ] Define authenticated supervisor topology exchange.
- [ ] Add supervisor identity and sequence numbers.
- [ ] Add observation timestamps and expiry.
- [ ] Exchange local readiness and Galera state.
- [ ] Exchange eligibility and calculated weight.
- [ ] Detect stale observations.
- [ ] Reject contradictory or unsafe observations.
- [ ] Keep local safety checks authoritative over remote observations.
- [ ] Store durable desired state in replicated metadata.
- [ ] Keep ephemeral health state out of the source-of-truth model.

## Sprint 8 — `galera-cli` operator workflows

- [x] Provide a standalone executable entrypoint.
- [x] Provide stable `--help` behavior.
- [x] Provide stable `--version` behavior.
- [ ] Implement supervisor API client with bearer authentication.
- [ ] Implement safe JSON/text output modes.
- [ ] Implement stable CLI exit codes.
- [ ] Implement `init`.
- [ ] Implement `health`.
- [ ] Implement `ready`.
- [ ] Implement `status`.
- [ ] Implement `cluster bootstrap`.
- [ ] Implement `cluster status`.
- [ ] Implement database provision/list/verify commands.
- [ ] Implement account provision/list/show commands.
- [ ] Implement account rotate/revoke/verify commands.
- [ ] Implement token create/list/rotate/revoke commands.
- [ ] Implement credential lease and refresh commands.
- [ ] Implement reconciliation plan/apply/verify commands.
- [ ] Add dry-run controls.
- [ ] Add confirmation controls for destructive operations.
- [ ] Never print secrets unless explicitly requested.

## Sprint 9 — Encrypted artifacts and GitOps

- [ ] Store age-encrypted ciphertext in metadata.
- [ ] Keep the age private key outside MariaDB.
- [ ] Store key version and checksum metadata.
- [ ] Store encrypted MySQL credential artifacts.
- [ ] Store encrypted SSH private keys.
- [ ] Store encrypted `known_hosts` material.
- [ ] Store encrypted TLS material.
- [ ] Store encrypted backup configuration.
- [ ] Store GitOps synchronization metadata.
- [ ] Verify artifact checksums and key versions.
- [ ] Rotate encrypted artifacts without losing metadata history.
- [ ] Synchronize generated application secret material into the GitOps workflow.
- [ ] Keep the Galera metadata database authoritative for managed identities.
- [ ] Document emergency behavior when the metadata database is unavailable.

## Sprint 10 — Backup, restore, and verification

- [ ] Back up the `galera_cli` metadata database through the normal backup system.
- [ ] Export encrypted artifact rows with metadata backups.
- [ ] Restore metadata before application databases.
- [ ] Recreate application databases from authoritative metadata.
- [ ] Recreate MariaDB accounts logically.
- [ ] Reapply structured grants logically.
- [ ] Verify restored credentials and privileges.
- [ ] Keep dump streams out of supervisor JSON APIs.
- [ ] Use native `mariadb-dump` for dump creation.
- [ ] Use native `mariadb` for data restoration.
- [ ] Add restore planning.
- [ ] Add restore confirmation and operation tracking.
- [ ] Add schema/data restore verification.
- [ ] Add application connectivity verification.
- [ ] Avoid restoring `mysql`, `sys`, `performance_schema`, or `information_schema` files as the account-recovery mechanism.

## Sprint 11 — VyOS and legacy removal

- [ ] Change VyOS HAProxy to HTTP mode for supervisor traffic only.
- [ ] Configure HAProxy checks against `/healthz` and `/readyz`.
- [ ] Keep supervisor nodes behind a stable HAProxy/VRRP endpoint.
- [ ] Remove MySQL HAProxy frontends and backends.
- [ ] Remove `agent-check` configuration.
- [ ] Remove TCP listeners `33060` and `33070`.
- [ ] Remove `galera-check.exe`.
- [ ] Remove the VyOS Galera checker environment file.
- [ ] Remove checker systemd units.
- [ ] Remove the checker installer.
- [ ] Remove the Galera health post-commit rewrite logic.
- [ ] Validate direct application-to-node port `3306` network access.
- [ ] Validate Kubernetes Services and NetworkPolicies for direct routes.
- [ ] Validate HAProxy supervisor failover.

## Sprint 12 — Migration and release readiness

- [ ] Migrate one internal application from `@eliware/mysql` to `@eliware/galera-lib`.
- [ ] Validate runtime, balanced, migration, and readonly identities.
- [ ] Validate credential rotation without application code changes.
- [ ] Validate node failure and bundle-based connection failover.
- [ ] Validate supervisor failure while existing SQL connections remain active.
- [ ] Validate metadata-first restore in Docker Desktop.
- [ ] Publish `@eliware/galera-lib` to the package registry.
- [ ] Publish `@eliware/galera-cli` as a separate package.
- [ ] Replace local `file:../galera-lib` links with released package versions.
- [ ] Add release CI for Ubuntu and Windows.
- [ ] Verify package contents with `npm pack --dry-run`.
- [ ] Verify audit, tests, lint, typecheck, and 100×4 coverage.
