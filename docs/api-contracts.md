# Elera Ecosystem API Contracts

This document is the shared contract reference for the Elera supervisor,
`@eliware/elera-lib`, and `elera-cli`. Endpoint status and the implementation
checklist are tracked separately in `docs/api.md`.

## System boundary

```text
application / elera-cli
        |
        v
HAProxy HTTP supervisor VIP
        |
        v
any supervisor node
        |
        +-- replicated elera_meta metadata
        +-- Elera health and routing decisions
        +-- credential leases

elera-lib receives a bundle and connects directly to eligible MariaDB nodes
```

HAProxy is not part of the MySQL data path. The supervisor quorum chooses
eligible nodes and assigns one logical writer per application. `elera-lib`
manages pools and connection-level failover within the unexpired bundle; it
does not discover Elera topology or invent writer assignments.

REST is the management and recovery interface. The preferred routing channel
is an authenticated WebSocket through the same HTTP VIP:

```text
GET       /api/v1/routing/bundle[?identity=<root-token-selector>]
WebSocket /api/v1/routing/stream
POST      /api/v1/routing/resync
```

The stream carries versioned routing snapshots, writer changes, drain and
recovery events, credential rotation notices, and heartbeats. It never carries
SQL. SQL uses direct MariaDB connections on port `3306`. If the stream fails,
the library reconnects with backoff and refreshes through REST before the
current bundle expires.

Scoped bearer tokens are self-describing: the supervisor resolves the token's
application and identity (and therefore its database and credential) without
an identity query parameter. A root token may select an identity explicitly;
an identity selector that conflicts with a scoped token is rejected.

On graceful node shutdown, the supervisor publishes a drain event, stops
accepting new SQL work, allows active queries and transactions to complete,
then closes pools and MariaDB. `elera-lib` immediately stops selecting the
draining node for new work and uses the next ordered candidate.

## Supervisor configuration contract

GitOps supplies supervisor intent through a Kubernetes ConfigMap for
non-secret configuration and a Secret for tokens, passwords, TLS, and other
sensitive material. The supervisor renders the uniform MariaDB and Elera
files; generated files are runtime artifacts, not a second configuration
source.

The reconciliation sequence is:

```text
load -> validate -> canonicalize -> hash -> render -> validate generated files
     -> atomically activate -> reload or controlled restart -> verify readiness
```

The MVP tracks desired and active hashes; a last-known-good rendered copy is
retained for recovery. These hashes identify drift. Dynamic settings
may use a graceful MariaDB reload. Listener, Elera provider, cluster
identity, or node identity changes require a controlled restart. Unsafe
bootstrap changes require explicit confirmation. Failed rendering or
validation leaves the last known-good active configuration untouched.

GitOps Secrets/operator-managed inputs are the initial home for SSH keys,
`known_hosts`, TLS files, and backup configuration. The supervisor may store
age-encrypted artifact ciphertext and metadata in `elera_meta`, but it does not
store age private keys or decrypt artifacts.

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

The bearer token is required in the WebSocket handshake `Authorization` header.
Query-string token authentication is not supported.
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
accept writes in a Elera cluster.

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
    { "host": "sql0.internal", "port": 3306, "weight": 100 },
    { "host": "sql1.internal", "port": 3306, "weight": 80 }
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

`elera-lib` sends writes only to ordered writer candidates and may use reader
entries for reads. It may use unexpired entries for pool balancing and
connection-level failover, but it must not invent a new writer assignment. It
should refresh when the bundle is stale, expired, or all candidates fail. It
must not automatically retry an in-flight mutation with unknown delivery
status.

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
reserved for explicit recovery-import paths.

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

The artifact store contains age-encrypted ciphertext and metadata. The age
private key remains with the CLI/operator or deployment Secret and is never
persisted in `elera_meta`. SSH keys, `known_hosts`, TLS material, and backup
configuration are supplied from GitOps/operator inputs; they are not returned
by these endpoints.

The implemented operations are:

```text
GET    /api/v1/secrets              (backup:read)
GET    /api/v1/secrets/{name}       (backup:read)
PUT    /api/v1/secrets/{name}       (backup:create)
DELETE /api/v1/secrets/{name}       (backup:restore)
POST   /api/v1/secrets/{name}/verify (backup:read)
```

Ciphertext must use the age armored format. There is deliberately no
decrypt/plaintext endpoint.

## Internal supervisor observations

Supervisor-to-supervisor requests use a dedicated scoped supervisor token:

```text
GET  /api/v1/internal/health
GET  /api/v1/internal/topology
POST /api/v1/internal/observations
```

Observations include the observer, subject node, sequence, timestamp,
readiness, Elera state, eligibility, and weight. Observations expire and must
not override local safety checks.

## Restore contract

Metadata and account restoration are logical operations. Raw restoration of
the `mysql`, `sys`, `performance_schema`, or `information_schema` files is not
the normal path.

```text
1. Restore elera_meta metadata
2. Restore encrypted artifact rows
3. Decrypt locally with the age key
4. Recreate application databases
5. Recreate MariaDB identities
6. Reapply structured grants
7. Verify connectivity and privileges
8. Restore application schemas and data with native commands
9. Verify application access
```

Large dump streams remain local to `elera-cli`; they do not pass through the
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

## Historical implementation sequence

The following sequence records the original vertical-slice design. It is
retained as project history, not as a statement that these steps are still
pending or must be implemented in this order. Current completion status is
tracked in `docs/feature-checklist.md`.

```text
1. Contract schemas and shared validation
2. elera-lib static primary/balanced client
3. Supervisor metadata initialization
4. Database/account/identity provisioning
5. elera-cli provisioning commands
6. Scoped token management
7. Credential leases and connection bundles
8. elera-lib bundle refresh and local failover
9. Encrypted artifacts and reconciliation
10. Metadata-first restore
11. Supervisor synchronization
12. HTTP-only VyOS HAProxy migration
```
