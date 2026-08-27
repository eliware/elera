# Galera Ecosystem API Contracts

This document is the shared contract reference for the Galera supervisor,
`@eliware/galera-lib`, and `galera-cli`. Endpoint status and the implementation
checklist are tracked separately in `docs/api.md`.

## System boundary

```text
application / galera-cli
        |
        v
HAProxy HTTP supervisor VIP
        |
        v
any supervisor node
        |
        +-- replicated galera_cli metadata
        +-- Galera health and routing decisions
        +-- credential leases

galera-lib receives a bundle and connects directly to eligible MariaDB nodes
```

HAProxy is not part of the MySQL data path. The supervisor chooses eligible
nodes and weights. `galera-lib` manages pools and connection-level failover
within the unexpired bundle; it does not discover Galera topology or make
eligibility decisions.

## Compatibility and versioning

The API base path is:

```text
/api/v1
```

Every response includes `apiVersion` and should include a request identifier.
Breaking changes require a new API version.

## Authentication

```http
Authorization: Bearer <token>
```

`ROOT_TOKEN` is a break-glass credential for first boot, cluster bootstrap,
metadata initialization, full restore, and token administration. It is not
stored in MariaDB.

Normal tokens are stored as hashes and are bound to resources and scopes.
Plaintext tokens are returned only once when created or rotated.

### SQL scopes

```text
connect  read  write  schema  execute  admin
```

### Management scopes

```text
token:read token:create token:revoke
database:read database:provision database:delete
account:read account:provision account:rotate account:revoke
credential:issue credential:refresh credential:revoke
metadata:read metadata:write
cluster:read cluster:operate
backup:read backup:create backup:restore
```

`primary` and `balanced` are routing policies, not permissions. Both may
accept writes in a Galera cluster.

## Response envelope

Successful response:

```json
{
  "apiVersion": "v1",
  "ok": true,
  "requestId": "request-123",
  "operation": "credentials.lease",
  "status": "completed",
  "changed": false,
  "data": {}
}
```

Long-running response:

```json
{
  "apiVersion": "v1",
  "ok": true,
  "requestId": "request-123",
  "operationId": "operation-123",
  "status": "running"
}
```

Error response:

```json
{
  "apiVersion": "v1",
  "ok": false,
  "requestId": "request-123",
  "error": {
    "code": "UNSAFE_STATE",
    "message": "node is not eligible for bootstrap",
    "retryable": false,
    "details": {}
  }
}
```

Errors must never contain passwords, bearer tokens, private keys, or plaintext
encrypted artifacts.

## Common request rules

Mutating endpoints support:

```text
dryRun=true
timeoutMs=<bounded integer>
confirm=true
Idempotency-Key: <stable caller-generated key>
```

Dangerous operations require `confirm: true`. Idempotent operations return the
existing result when the same idempotency key is replayed.

## Connection bundle

The supervisor returns a connection bundle through a credential lease. It is a
policy decision, not a topology-discovery API for the client.

```json
{
  "leaseId": "lease-123",
  "identity": "billing-runtime",
  "database": "billing",
  "credentials": {
    "username": "billing_runtime",
    "password": "short-lived-secret"
  },
  "routes": {
    "primary": [
      { "host": "sql0.internal", "port": 3306, "weight": 100 }
    ],
    "balanced": [
      { "host": "sql0.internal", "port": 3306, "weight": 100 },
      { "host": "sql1.internal", "port": 3306, "weight": 80 },
      { "host": "sql2.internal", "port": 3306, "weight": 60 }
    ]
  },
  "bundleVersion": 42,
  "refreshAfter": "2026-08-26T20:00:00Z",
  "expiresAt": "2026-08-26T21:00:00Z"
}
```

`galera-lib` may use unexpired bundle entries for connection establishment,
pool balancing, and connection-level failover. It should refresh when the
bundle is stale, expired, or all candidates fail. It must not automatically
retry an in-flight mutation with unknown delivery status.

Transactions remain pinned to one connection and one route. Unknown or
ambiguous SQL defaults to the primary route.

## Credential lease contract

Request:

```json
{
  "database": "billing",
  "identity": "billing-runtime",
  "routes": ["primary", "balanced"]
}
```

Response: the connection bundle above.

Lease operations:

```text
POST /api/v1/credentials/lease
POST /api/v1/credentials/refresh
POST /api/v1/credentials/revoke
GET  /api/v1/routes
```

The API may return credentials directly over authenticated TLS or return an
encrypted envelope, but durable records must contain ciphertext only.

## Managed resources

### Database

```json
{
  "name": "billing",
  "owner": "billing",
  "charset": "utf8mb4",
  "collation": "utf8mb4_unicode_ci",
  "state": "active"
}
```

### Identity

```json
{
  "name": "billing-runtime",
  "database": "billing",
  "purpose": "runtime",
  "scopes": ["connect", "read", "write"],
  "state": "active"
}
```

### Token

```json
{
  "name": "billing-runtime-token",
  "subject": "billing",
  "bindings": [
    {
      "resource": "identity/billing-runtime",
      "scopes": ["credential:issue", "credential:refresh"]
    }
  ],
  "expiresAt": null,
  "state": "active"
}
```

### Structured grants

```json
{
  "identity": "billing-runtime",
  "database": "billing",
  "grants": [
    {
      "scope": "billing.*",
      "privileges": ["SELECT", "INSERT", "UPDATE", "DELETE"]
    }
  ]
}
```

The supervisor generates SQL from structured grants. Arbitrary grant SQL is
reserved for compatibility and recovery import paths.

## Encrypted artifacts

```json
{
  "name": "billing/runtime-credential",
  "kind": "mysql-credential",
  "ciphertext": "age-encrypted-data",
  "keyVersion": "kops-2026-01",
  "checksum": "sha256:..."
}
```

Artifacts may contain credentials, SSH keys, `known_hosts`, TLS material,
backup configuration, and GitOps synchronization metadata. The age private key
remains with the CLI/operator or deployment secret store.

## Internal supervisor observations

Supervisor-to-supervisor requests use a dedicated scoped supervisor token:

```text
GET  /api/v1/internal/health
GET  /api/v1/internal/topology
POST /api/v1/internal/observations
```

Observations include the observer, subject node, sequence, timestamp,
readiness, Galera state, eligibility, and weight. Observations expire and must
not override local safety checks.

## Restore contract

Metadata and account restoration are logical operations. Raw restoration of
the `mysql`, `sys`, `performance_schema`, or `information_schema` files is not
the normal path.

```text
1. Restore galera_cli metadata
2. Restore encrypted artifact rows
3. Decrypt locally with the age key
4. Recreate application databases
5. Recreate MariaDB identities
6. Reapply structured grants
7. Verify connectivity and privileges
8. Restore application schemas and data with native commands
9. Verify application access
```

Large dump streams remain local to `galera-cli`; they do not pass through the
supervisor API as JSON.

## Operation contract

```json
{
  "operationId": "operation-123",
  "type": "accounts.reconcile",
  "status": "running",
  "requestId": "request-123",
  "requestedBy": "billing-cli-token",
  "createdAt": "2026-08-26T19:00:00Z",
  "completedAt": null,
  "result": null
}
```

Operation results are redacted and never contain secret material.

```text
GET  /api/v1/operations
GET  /api/v1/operations/{operationId}
POST /api/v1/operations/{operationId}/cancel
```

## Implementation sequence

```text
1. Contract schemas and shared validation
2. galera-lib static primary/balanced client
3. Supervisor metadata initialization
4. Database/account/identity provisioning
5. galera-cli provisioning commands
6. Scoped token management
7. Credential leases and connection bundles
8. galera-lib bundle refresh and local failover
9. Encrypted artifacts and reconciliation
10. Metadata-first restore
11. Supervisor synchronization
12. HTTP-only VyOS HAProxy migration
```
