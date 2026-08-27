# Elera Supervisor API Checklist

The supervisor API is the control plane for `elera-lib`, `elera-cli`, GitOps,
and recovery. HAProxy should proxy supervisor HTTP only. The supervisor makes
health, topology, eligibility, routing, and credential decisions. `elera-lib`
uses the returned routing bundle to maintain direct SQL connections.

`ROOT_TOKEN` is reserved for first boot, bootstrap, metadata initialization,
full restore, and token administration. Normal clients use scoped bearer
tokens. The replicated `elera_meta` database is authoritative for managed
databases, identities, accounts, grants, tokens, and encrypted artifact
metadata. The age private key is never stored in MariaDB.

## GitOps supervisor configuration

GitOps owns the supervisor's desired configuration, not hand-authored
MariaDB/Elera files. Kubernetes should provide a supervisor ConfigMap for
non-secret intent and a separate Secret for tokens, passwords, TLS material,
and other sensitive inputs. The supervisor validates that intent and renders
the standardized MariaDB and Elera configuration files locally.

- [x] `GET /api/v1/config/intent` — inspect the validated non-secret supervisor intent and desired hash.
- [x] `POST /api/v1/config/plan` — classify changes as no-op, reload, restart, or unsafe.
- [x] `POST /api/v1/config/apply` — atomically render and apply a confirmed configuration.
- [x] `POST /api/v1/config/verify` — compare the active rendered intent with the desired intent.
- [ ] `POST /api/v1/config/rollback` — restore the last known-good rendered configuration (deferred after MVP).

The MVP tracks desired and active hashes; a retained last-known-good file is
used for recovery before a dedicated rollback endpoint is added. It writes
files atomically, validates generated configuration before activation, and
only reloads MariaDB for dynamic changes. Listener,
provider, cluster identity, or node identity changes require a controlled
restart; unsafe bootstrap changes require explicit confirmation.

## Public probes

- [x] `GET /healthz` — process liveness; always returns `200` while serving.
- [x] `GET /readyz` — local supervisor and MariaDB readiness; returns `503` until ready.

## Status and diagnostics

- [x] `GET /api/v1/status` — redacted local service and database status.
- [ ] `GET /api/v1/version` — supervisor, MariaDB, and provider versions.
- [ ] `GET /api/v1/config` — effective non-secret configuration.
- [ ] `GET /api/v1/diagnostics` — redacted support and automation snapshot.
- [ ] `GET /api/v1/metrics` — optional Prometheus metrics.

## Supervisor synchronization

- [x] `GET /api/v1/cluster/status` — local and currently observed cluster state.
- [ ] `GET /api/v1/cluster/writer-assignments` — current per-application writer assignments.
- [x] `GET /api/v1/cluster/topology` — current observations and quorum decision.
- [ ] `GET /api/v1/internal/health` — authenticated supervisor health observation.
- [ ] `GET /api/v1/internal/topology` — authenticated supervisor topology exchange.
- [ ] `POST /api/v1/internal/observations` — publish a signed or authenticated observation.

Observations must expire. A stale observation cannot keep a node eligible.

## First boot and metadata

- [x] `GET /api/v1/initialization` — inspect data-directory initialization state.
- [x] `POST /api/v1/initialization/plan` — preview first-boot changes.
- [x] `POST /api/v1/initialization/apply` — apply basic database/user/grant setup.
- [x] `POST /api/v1/initialization/verify` — verify current basic initialization.
- [ ] `POST /api/v1/initialization/rotate-credentials` — rotate bootstrap credentials.
- [x] `GET /api/v1/metadata/status` — inspect `elera_meta` schema and migration state.
- [x] `POST /api/v1/metadata/initialize` — create or migrate the metadata schema; requires `confirm: true`.
- [x] `POST /api/v1/metadata/verify` — verify metadata integrity and replication state.
- [x] `GET /api/v1/cluster/observations` — inspect fresh peer observations.
- [x] `POST /api/v1/cluster/observations` — submit an authenticated observation.
- [x] `GET /api/v1/cluster/quorum` — evaluate the current fresh observation quorum.
- [x] `POST /api/v1/cluster/lifecycle/plan` — plan a bootstrap, join, leave, or recovery operation.
- [x] `POST /api/v1/cluster/lifecycle/apply` — execute an injected lifecycle operation with confirmation.

## Elera lifecycle

- [x] `GET /api/v1/cluster/bootstrap/eligibility` — explain bootstrap safety.
- [x] `POST /api/v1/cluster/bootstrap/plan` — preview bootstrap checks.
- [x] `POST /api/v1/cluster/bootstrap` — explicitly create a Primary component.
- [x] `POST /api/v1/cluster/join/plan` — preview normal cluster joining.
- [x] `POST /api/v1/cluster/join` — join a configured cluster.
- [x] `POST /api/v1/cluster/leave` — gracefully leave the cluster.
- [x] `POST /api/v1/cluster/recover/plan` — analyze total-cluster-loss recovery.
- [x] `POST /api/v1/cluster/recover` — execute confirmed recovery.
- [x] `GET /api/v1/cluster/wait-ready` — wait for local readiness.

## Connection bundles

- [x] `POST /api/v1/credentials/lease` — issue credentials and eligible direct SQL routes.
- [x] `POST /api/v1/credentials/refresh` — refresh an existing credential lease.
- [ ] `POST /api/v1/credentials/revoke` — revoke a credential lease.
- [x] `GET /api/v1/routes` — return ordered application writer and reader candidates.
- [x] `POST /api/v1/routes/refresh` — explicitly recalculate a routing bundle.
- [x] `GET /api/v1/routing/bundle` — return the complete credential and routing snapshot.
- [x] `GET /api/v1/routing/stream` — upgrade to the authenticated routing WebSocket.
- [x] `GET /api/v1/routing/resync` — return a current snapshot after reconnect.

Bundles contain the database, identity, usable credentials, direct node
addresses on port `3306`, ordered writer and reader candidates, weights, a
version, refresh time, and expiry. The supervisor quorum assigns one logical
writer per application. `elera-lib` sends writes to that writer list and may
use permitted reader entries for reads. The WebSocket carries routing changes,
drain/recovery events, credential rotation notices, and heartbeats—not SQL.
REST bundle refresh remains the correctness fallback when the stream is down.
The stream is the preferred low-latency path: supervisors evaluate health and
load about once per second and publish state changes instead of relying on
slow client polling.

## Scoped tokens

- [ ] `GET /api/v1/tokens` — list redacted token metadata.
- [x] `POST /api/v1/tokens` — create a scoped bearer token.
- [ ] `GET /api/v1/tokens/{name}` — inspect token metadata and bindings.
- [ ] `POST /api/v1/tokens/{name}/rotate` — rotate token material.
- [x] `POST /api/v1/tokens/revoke` — revoke a token.
- [ ] `POST /api/v1/tokens/{name}/bindings` — add resource and scope bindings.
- [ ] `DELETE /api/v1/tokens/{name}/bindings/{binding}` — remove a token binding.

## Managed identities

- [x] `GET /api/v1/identities` — list managed database identities.
- [x] `POST /api/v1/identities` — register and provision an identity.
- [ ] `GET /api/v1/identities/{name}` — inspect identity metadata and scopes.
- [ ] `PATCH /api/v1/identities/{name}` — update identity metadata.
- [x] `POST /api/v1/identities/rotate` — rotate the identity credential.
- [x] `POST /api/v1/identities/revoke` — revoke the identity.

## Databases

- [x] `GET /api/v1/databases` — list managed application databases.
- [ ] `GET /api/v1/databases/{name}` — inspect database metadata.
- [ ] `POST /api/v1/databases/plan` — preview database changes.
- [ ] `POST /api/v1/databases/apply` — create or reconcile databases.
- [ ] `POST /api/v1/databases/verify` — verify desired database state.
- [ ] `DELETE /api/v1/databases/{name}` — explicitly remove a managed database.

## Accounts and grants

- [x] `GET /api/v1/accounts` — list accounts without passwords.
- [ ] `GET /api/v1/accounts/{name}` — inspect managed account metadata.
- [x] `POST /api/v1/accounts/provision` — provision an account and generated credential.
- [ ] `POST /api/v1/accounts/plan` — preview account changes.
- [ ] `POST /api/v1/accounts/{name}/rotate` — rotate an account password.
- [x] `POST /api/v1/accounts/revoke` — revoke an account.
- [ ] `GET /api/v1/accounts/{name}/grants` — list structured grants.
- [ ] `PUT /api/v1/accounts/{name}/grants` — reconcile structured grants.
- [x] `POST /api/v1/accounts/verify` — verify account and grants.
- [x] `POST /api/v1/accounts/export` — export logical account SQL.
- [ ] `POST /api/v1/accounts/import/plan` — preview logical account restoration.
- [x] `POST /api/v1/accounts/import` — import logical accounts and grants.

Normal provisioning uses structured grant objects. Raw grant SQL is retained
only for compatibility and recovery imports.

## Encrypted artifacts

- [ ] `GET /api/v1/secrets` — list encrypted artifact metadata (deferred after MVP).
- [ ] `POST /api/v1/secrets` — store age-encrypted ciphertext.
- [ ] `GET /api/v1/secrets/{name}` — retrieve encrypted ciphertext.
- [ ] `PUT /api/v1/secrets/{name}` — replace encrypted ciphertext.
- [ ] `DELETE /api/v1/secrets/{name}` — delete an encrypted artifact.
- [ ] `POST /api/v1/secrets/{name}/verify` — verify checksum and key metadata.

The initial implementation stores application/database/account metadata and
credential metadata in `elera_meta`. Centralized SSH keys, `known_hosts`, TLS
files, and backup artifacts are deferred; they remain in GitOps Secrets or the
existing operator-managed artifact path. Plaintext secrets must not be stored
durably.

## Reconciliation

- [ ] `POST /api/v1/reconcile/plan` — compare desired metadata with MariaDB.
- [ ] `POST /api/v1/reconcile/apply` — reconcile databases, accounts, and grants.
- [ ] `POST /api/v1/reconcile/verify` — report drift without changing state.

## Backup and restore coordination

- [ ] `POST /api/v1/backups/plan` — preview backup eligibility and metadata.
- [ ] `POST /api/v1/backups/create` — coordinate backup metadata.
- [ ] `POST /api/v1/backups/{id}/verify` — verify backup metadata and artifact.
- [ ] `POST /api/v1/restores/metadata/plan` — plan metadata restoration.
- [ ] `POST /api/v1/restores/metadata/apply` — restore `elera_meta` metadata.
- [ ] `POST /api/v1/restores/accounts/plan` — plan account restoration.
- [ ] `POST /api/v1/restores/accounts/apply` — recreate accounts and grants.
- [ ] `POST /api/v1/restores/accounts/verify` — verify account restoration.
- [ ] `POST /api/v1/restores/plan` — plan application data restoration.
- [ ] `POST /api/v1/restores/apply` — coordinate application restoration.

Recovery order is metadata, encrypted artifacts, databases, accounts, grants,
connectivity verification, application schemas/data, and application
verification. `elera-cli` continues to stream dumps through native
`mariadb-dump` and `mariadb` processes; dump contents do not pass through JSON.

## Maintenance

- [x] `GET /api/v1/traffic/status` — inspect local eligibility and drain state.
- [x] `POST /api/v1/traffic/drain` — stop issuing local routes.
- [x] `POST /api/v1/traffic/undrain` — resume issuing local routes.
- [ ] `POST /api/v1/maintenance/start` — drain and enter maintenance.
- [ ] `POST /api/v1/maintenance/stop` — exit maintenance safely.

Graceful shutdown allows active queries and transactions to complete, rejects
new SQL work, publishes routing changes so `elera-lib` immediately selects
the next writer or reader candidate, then closes pools and stops MariaDB.

## Operations

- [ ] `GET /api/v1/operations` — list redacted operations.
- [ ] `GET /api/v1/operations/{operationId}` — inspect an operation.
- [ ] `POST /api/v1/operations/{operationId}/cancel` — cancel a cancellable operation.

Mutating operations should support `dryRun`, bounded `timeoutMs`, explicit
`confirm`, and `Idempotency-Key`. Operation records must never contain
passwords, bearer tokens, age private keys, or plaintext artifacts.

## Legacy removal checklist

- [ ] Remove MySQL backends from VyOS HAProxy.
- [ ] Configure VyOS HAProxy as HTTP-only supervisor load balancer.
- [ ] Remove VyOS `agent-check` configuration.
- [ ] Remove TCP listeners `33060` and `33070` from the supervisor.
- [ ] Remove `elera-check.exe` from VyOS.
- [ ] Remove VyOS Elera checker systemd units and installer.
- [ ] Remove VyOS checker environment and post-commit rewrite logic.
