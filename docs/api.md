# Galera Supervisor API Checklist

The supervisor API is the control plane for `galera-lib`, `galera-cli`, GitOps,
and recovery. HAProxy should proxy supervisor HTTP only. The supervisor makes
health, topology, eligibility, routing, and credential decisions. `galera-lib`
uses the returned routing bundle to maintain direct SQL connections.

`ROOT_TOKEN` is reserved for first boot, bootstrap, metadata initialization,
full restore, and token administration. Normal clients use scoped bearer
tokens. The replicated `galera_cli` database is authoritative for managed
databases, identities, accounts, grants, tokens, and encrypted artifact
metadata. The age private key is never stored in MariaDB.

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
- [ ] `GET /api/v1/cluster/topology` — cluster members, addresses, state, and eligibility.
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
- [ ] `GET /api/v1/metadata/status` — inspect `galera_cli` schema and migration state.
- [ ] `POST /api/v1/metadata/initialize` — create or migrate the metadata schema.
- [ ] `POST /api/v1/metadata/verify` — verify metadata integrity and replication.

## Galera lifecycle

- [x] `GET /api/v1/cluster/bootstrap/eligibility` — explain bootstrap safety.
- [x] `POST /api/v1/cluster/bootstrap/plan` — preview bootstrap checks.
- [x] `POST /api/v1/cluster/bootstrap` — explicitly create a Primary component.
- [ ] `POST /api/v1/cluster/join/plan` — preview normal cluster joining.
- [ ] `POST /api/v1/cluster/join` — join a configured cluster.
- [ ] `POST /api/v1/cluster/leave` — gracefully leave the cluster.
- [ ] `POST /api/v1/cluster/recover/plan` — analyze total-cluster-loss recovery.
- [ ] `POST /api/v1/cluster/recover` — execute confirmed recovery.
- [x] `GET /api/v1/cluster/wait-ready` — wait for local readiness.

## Connection bundles

- [ ] `POST /api/v1/credentials/lease` — issue credentials and eligible direct SQL routes.
- [ ] `POST /api/v1/credentials/refresh` — refresh an existing credential lease.
- [ ] `POST /api/v1/credentials/revoke` — revoke a credential lease.
- [ ] `GET /api/v1/routes` — return policy-selected primary and balanced node routes.
- [ ] `POST /api/v1/routes/refresh` — explicitly recalculate a routing bundle.

Bundles contain direct node addresses, port `3306`, route roles, weights,
refresh time, and expiry. `primary` and `balanced` describe routing policy,
not SQL permissions. `galera-lib` may fail over among unexpired bundle entries;
the supervisor remains the routing authority.

## Scoped tokens

- [ ] `GET /api/v1/tokens` — list redacted token metadata.
- [ ] `POST /api/v1/tokens` — create a scoped bearer token.
- [ ] `GET /api/v1/tokens/{name}` — inspect token metadata and bindings.
- [ ] `POST /api/v1/tokens/{name}/rotate` — rotate token material.
- [ ] `POST /api/v1/tokens/{name}/revoke` — revoke a token.
- [ ] `POST /api/v1/tokens/{name}/bindings` — add resource and scope bindings.
- [ ] `DELETE /api/v1/tokens/{name}/bindings/{binding}` — remove a token binding.

## Managed identities

- [ ] `GET /api/v1/identities` — list managed database identities.
- [ ] `POST /api/v1/identities` — register and provision an identity.
- [ ] `GET /api/v1/identities/{name}` — inspect identity metadata and scopes.
- [ ] `PATCH /api/v1/identities/{name}` — update identity metadata.
- [ ] `POST /api/v1/identities/{name}/rotate` — rotate the identity credential.
- [ ] `POST /api/v1/identities/{name}/revoke` — revoke the identity.

## Databases

- [ ] `GET /api/v1/databases` — list managed application databases.
- [ ] `GET /api/v1/databases/{name}` — inspect database metadata.
- [ ] `POST /api/v1/databases/plan` — preview database changes.
- [ ] `POST /api/v1/databases/apply` — create or reconcile databases.
- [ ] `POST /api/v1/databases/verify` — verify desired database state.
- [ ] `DELETE /api/v1/databases/{name}` — explicitly remove a managed database.

## Accounts and grants

- [x] `GET /api/v1/accounts` — list accounts without passwords.
- [ ] `GET /api/v1/accounts/{name}` — inspect managed account metadata.
- [ ] `POST /api/v1/accounts` — provision an account and generated credential.
- [ ] `POST /api/v1/accounts/plan` — preview account changes.
- [ ] `POST /api/v1/accounts/{name}/rotate` — rotate an account password.
- [ ] `POST /api/v1/accounts/{name}/revoke` — revoke an account.
- [ ] `GET /api/v1/accounts/{name}/grants` — list structured grants.
- [ ] `PUT /api/v1/accounts/{name}/grants` — reconcile structured grants.
- [ ] `POST /api/v1/accounts/{name}/verify` — verify account and grants.
- [x] `POST /api/v1/accounts/export` — export logical account SQL.
- [ ] `POST /api/v1/accounts/import/plan` — preview logical account restoration.
- [x] `POST /api/v1/accounts/import` — import logical accounts and grants.

Normal provisioning uses structured grant objects. Raw grant SQL is retained
only for compatibility and recovery imports.

## Encrypted artifacts

- [ ] `GET /api/v1/secrets` — list encrypted artifact metadata.
- [ ] `POST /api/v1/secrets` — store age-encrypted ciphertext.
- [ ] `GET /api/v1/secrets/{name}` — retrieve encrypted ciphertext.
- [ ] `PUT /api/v1/secrets/{name}` — replace encrypted ciphertext.
- [ ] `DELETE /api/v1/secrets/{name}` — delete an encrypted artifact.
- [ ] `POST /api/v1/secrets/{name}/verify` — verify checksum and key metadata.

Artifacts may include credentials, SSH keys, `known_hosts`, TLS material,
backup configuration, and GitOps synchronization metadata. Plaintext secrets
must not be stored durably.

## Reconciliation

- [ ] `POST /api/v1/reconcile/plan` — compare desired metadata with MariaDB.
- [ ] `POST /api/v1/reconcile/apply` — reconcile databases, accounts, and grants.
- [ ] `POST /api/v1/reconcile/verify` — report drift without changing state.

## Backup and restore coordination

- [ ] `POST /api/v1/backups/plan` — preview backup eligibility and metadata.
- [ ] `POST /api/v1/backups/create` — coordinate backup metadata.
- [ ] `POST /api/v1/backups/{id}/verify` — verify backup metadata and artifact.
- [ ] `POST /api/v1/restores/metadata/plan` — plan metadata restoration.
- [ ] `POST /api/v1/restores/metadata/apply` — restore `galera_cli` metadata.
- [ ] `POST /api/v1/restores/accounts/plan` — plan account restoration.
- [ ] `POST /api/v1/restores/accounts/apply` — recreate accounts and grants.
- [ ] `POST /api/v1/restores/accounts/verify` — verify account restoration.
- [ ] `POST /api/v1/restores/plan` — plan application data restoration.
- [ ] `POST /api/v1/restores/apply` — coordinate application restoration.

Recovery order is metadata, encrypted artifacts, databases, accounts, grants,
connectivity verification, application schemas/data, and application
verification. `galera-cli` continues to stream dumps through native
`mariadb-dump` and `mariadb` processes; dump contents do not pass through JSON.

## Maintenance

- [x] `GET /api/v1/traffic/status` — inspect local eligibility and drain state.
- [x] `POST /api/v1/traffic/drain` — stop issuing local routes.
- [x] `POST /api/v1/traffic/undrain` — resume issuing local routes.
- [ ] `POST /api/v1/maintenance/start` — drain and enter maintenance.
- [ ] `POST /api/v1/maintenance/stop` — exit maintenance safely.

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
- [ ] Remove `galera-check.exe` from VyOS.
- [ ] Remove VyOS Galera checker systemd units and installer.
- [ ] Remove VyOS checker environment and post-commit rewrite logic.
