# MariaDB Galera Container Specification

## 1. Purpose

`galera` is a purpose-built MariaDB/Galera container image and Node.js
supervisor for Eliware infrastructure. It replaces the current legacy,
unmaintained MariaDB image and provides a controlled interface for Kubernetes
and HAProxy running on VyOS.

The container owns the database process and exposes simple health endpoints so
Kubernetes and VyOS do not need a language runtime or database client library.

The supervisor is intentionally colocated with MariaDB so Kubernetes and the
external router use one versioned, per-node process and health contract. A
sidecar or separate health service would add another lifecycle, network path,
and deployment artifact. This tradeoff is accepted only if the supervisor is
small and non-administrative: if it or its HTTP service fails while MariaDB is
healthy, liveness and traffic eligibility fail until Kubernetes restarts the
pod.

## 2. Scope

The project includes:

- A minimal Node.js 26+ native ESM process running as container PID 1.
- Supervision of the local MariaDB process.
- MariaDB/Galera health and statistics checks using `@eliware/mysql`.
- Kubernetes-compatible liveness and readiness endpoints.
- Structured operational logging using `@eliware/common`.
- Correct signal forwarding, child-process reaping, and bounded shutdown.
- A container image with pinned, reproducible dependencies.
- A standard `node:26-bookworm-slim` runtime base, pinned by digest for
  releases in the same manner as the other Eliware projects.
- Documentation for configuration, operations, upgrade, and compatibility.

Production migration, backup, restore, cutover, and rollback procedures are
documented separately in the shared operations repository.

Application account provisioning, credential rotation, grant reconciliation,
backup, restore, and controlled cluster orchestration belong to the separate
`galera-cli` project. This image does not expose administrative APIs for those
operations.

## 3. Explicit exclusions

The project will not initially include:

- Automatic Galera bootstrap or cluster formation.
- Automatic decisions about `safe_to_bootstrap`.
- An HTTP API for bootstrapping, starting, stopping, or reconfiguring a
  cluster.
- A web console or browser UI.
- General-purpose database administration features.
- Automatic production migration or rollback.
- Production backup, offsite synchronization, restore, or retention.

Galera bootstrap and cluster formation will be performed manually through a
separate operational procedure. Any future administrative interface would
require a separate design and strong access controls.

## 4. Runtime architecture

The container entrypoint is the Node.js supervisor. MariaDB runs as a child
process in the foreground/non-daemon mode supported by the selected image.

The production security context must run initialization and normal operation
without root. The target runtime identity is fixed UID/GID `999:999` (the
image's MariaDB service identity), with no Linux capabilities, a read-only
root filesystem, and only `/var/lib/mysql`, `/run/mysqld`, and an explicit
temporary path writable. Kubernetes must use the RuntimeDefault seccomp
profile and the cluster's enforced AppArmor baseline. MariaDB initialization
must work under this identity; privileged initialization is a release failure.

The initial Kubernetes resource baseline is 500m CPU and 2 GiB memory requests,
2 CPU and 4 GiB memory limits, and 1 GiB ephemeral-storage request/2 GiB
limit. These are starting values to be load-tested and adjusted before
production approval, not substitutes for workload validation. The deployment
must also specify MariaDB memory settings, file-descriptor/`ulimit` values,
startup grace, and termination grace. The MariaDB memory budget must remain
below the container memory limit with room for Galera, connections, and OS
buffers.

The supervisor is responsible for:

1. Validating configuration before starting external processes.
2. Starting MariaDB with the approved arguments.
3. Tracking the child process and its exit state.
4. Recording startup, exit, restart, and failure information.
5. Applying bounded, conservative restart behavior for unexpected exits.
6. Forwarding termination signals to MariaDB.
7. Reaping children and completing cleanup before exiting.
8. Exiting non-zero when recovery is exhausted or shutdown cannot complete.

Repeated restart loops must be bounded and observable. The supervisor must not
make a restart look like successful database readiness.

The initial policy permits at most three supervisor-managed restart attempts
within five minutes, with delays of approximately 1, 2, and 5 seconds. After
that limit the process exits non-zero and Kubernetes owns the next restart
decision. A clean MariaDB exit is not treated as readiness.

Acceptance requires exit code 0 only for intentional shutdown, a non-zero
code for startup failure, unexpected child failure, restart exhaustion, or
shutdown timeout, and no in-place restart after the retry budget is exhausted.
Lifecycle logs contain timestamp, event, child exit status, restart count,
severity, and redacted reason; log backpressure must not deadlock shutdown.

## 5. Health model

The database is ready for traffic only when all of the following are true:

```text
wsrep_local_state_comment = Synced
wsrep_ready = ON
wsrep_cluster_status = Primary
```

Missing, duplicated, malformed, query-failed, or unexpected values are
unhealthy. States such as `Donor`, `Joining`, `Joined`, `Desynced`,
`Initialized`, and `Non-Primary` must not be reported as ready.

The checker does not infer backend identity from the database response. Endpoint
identity is delegated to deployment configuration and networking; a future
identity check would be a separate requirement.

## 6. HTTP endpoints

The service exposes a minimal HTTP interface. It does not serve a web console.
Version one is HTTP-only. HTTPS, certificate reload, client-certificate
validation, and VyOS HTTPS behavior are deferred capabilities and must not be
assumed to be available.

The canonical endpoint contract is `/healthz` for supervisor liveness,
`/readyz/read` for read eligibility, and `/readyz/write` for writer
eligibility. Kubernetes uses `/healthz` for liveness and `/readyz/read` for
readiness unless a reviewed single-writer workload explicitly selects
`/readyz/write`; VyOS HAProxy uses the traffic-class endpoint matching its
frontend. Connection, response, and body timeouts are bounded and every
timeout, non-2xx response, malformed body, unavailable MariaDB, non-Primary
state, or failed query is ineligible.

### `/healthz`

Liveness endpoint. It answers whether the supervisor process and HTTP server are
alive. It must not claim that MariaDB is ready merely because the supervisor is
running.

### `/readyz`

Readiness endpoint. It returns HTTP success only when MariaDB is reachable and
the complete Galera health model in section 5 is satisfied. During startup,
shutdown, restart, joining, donor activity, state transfer, desynchronization,
query failure, or a non-Primary component it returns a non-success status.

Traffic eligibility is separate. `/readyz/read` requires the complete Galera
readiness model. `/readyz/write` additionally requires
`read_only=OFF`, `wsrep_reject_queries=OFF`, `wsrep_local_state=4`,
`wsrep_desync=OFF`, an adequate Primary component size, and an explicit
deployment-controlled writer designation. A node is never a writer merely
because it is reachable, Synced, or Primary. The deployment must ensure that
no more than one node is designated for the single-writer traffic class.

The writer designation is an explicit per-member GitOps value, rendered only
for the currently approved writer and changed through a reviewed failover or
recovery operation. It is not derived from pod ordinal, IP address, startup
order, or MariaDB reachability. A writer transition must remove the old
designation, verify its traffic is fenced, then apply and verify the new one.
Conflicting or missing designations make every `/readyz/write` response
unhealthy.

`/metrics` is observability-only and must never be used as a routing decision.

### Diagnostic status

Detailed status may be exposed through a non-console diagnostic response or
logs, but it must not be required by Kubernetes or HAProxy and must not expose
passwords or private key material.

## 7. HAProxy/VyOS integration

VyOS will use a small `curl`-based external check against the readiness
endpoint. The adapter must map HTTP readiness to HAProxy's expected response
without requiring Rust, Node.js, or a MySQL client on VyOS.

The normal operational contract is:

- HTTP success from the traffic-class endpoint means the backend may be
  considered eligible for that class.
- Any timeout, connection failure, non-success HTTP response, malformed body,
  or unavailable endpoint means the backend is down.

The database container must remain independent of VyOS configuration and must
not modify HAProxy configuration itself.

## 8. Database access

All MariaDB connections and health/statistics queries use `@eliware/mysql`.
All logging, path handling, process errors, and signal/lifecycle handling use
the corresponding APIs exported by `@eliware/common`.

The health query must retrieve at least:

- `wsrep_local_state_comment`
- `wsrep_ready`
- `wsrep_cluster_status`

Writer checks must also retrieve and validate `read_only`,
`wsrep_reject_queries`, `wsrep_local_state`, `wsrep_desync`, and the component
size. Query errors and unexpected values fail closed for the affected traffic
class.

Health checks must use read-only SQL inspection. They must not use application
write queries, mutation probes, or unsafe transactions.

Performance/statistics checks may additionally retrieve Galera queue and flow
control values, but performance scoring must not override the hard readiness
requirements.

Performance-based traffic weighting is deferred from the initial production
release. Initial readiness is binary. A future weighting design must define
metrics, thresholds, zero-weight behavior, and failure handling separately.

Connection, acquisition, and query operations require bounded timeouts. A
health request must have an explicit deadline and must fail closed when the
database is slow or unavailable.

The initial timing defaults are:

```text
TCP connection       2 seconds
pool acquisition      2 seconds
SQL query             3 seconds
health polling        5 seconds
stale result limit   15 seconds
shutdown grace       30 seconds
```

The health monitor runs in the background and `/readyz/read` and
`/readyz/write` return cached results immediately. The HTTP path must not
create an independent database check for every caller.

The health states are distinct: database healthy means MariaDB is reachable
and reports valid status; read-eligible additionally satisfies the read policy;
writer-eligible additionally satisfies the single-writer policy. A write health
check is read-only and never performs an application mutation.

The MariaDB server package and Galera provider must be selected explicitly for
the image. The currently selected MariaDB target is `12.3.3`, with the
matching `galera-4` package. MariaDB `12.3.1` is not available from the
official Bookworm package source used by this project and is not the current
build target. MariaDB and Galera packages will come from MariaDB's official
Debian Bookworm repository rather than Debian's potentially older MariaDB
packages. Debian repositories may still provide ordinary base-system
dependencies.

MariaDB 12.3.3 with its matching Galera 4 provider is the intended production
target, pending compatibility certification. The 10.6, 10.11, and 11.4
combinations are exploratory compatibility targets, not alternative approved
production versions. The selected pair's support and lifecycle status must be
revalidated at each release.

The image build must use explicit build arguments or equivalent pinned package
versions for the MariaDB series, MariaDB server, and `galera-4`; it must never
use an unversioned `latest` install. Updating versions is an intentional source
change followed by a rebuild and compatibility test. The exact package version
strings, repository configuration, architecture, and resulting image digest
must be recorded for each release. The chosen server/provider combination must
be validated as a pair because they may not share the same version number.

The initial implementation should prefer normal package-manager dependency
resolution from the official MariaDB repository. Manually vendoring every
`.deb` is not required unless reproducibility or repository availability later
demands it.

Every node must have a unique, explicitly configured `server_id`. The image
must fail closed when binary logging is enabled without a valid node identity;
it must not silently default every member to `server_id=1`.

The build must record repository metadata, exact package versions, and package
checksums or snapshot identity. A release cannot promote packages resolved
from an unrecorded moving index.

The release must test binary logging and unique identity on every member.

## 9. Configuration

Configuration is supplied by the deployment environment or a protected secret
mechanism. It must not be committed to Git or baked into the image.

Configuration precedence is explicit environment variable, then mounted file,
then documented default. Required and malformed values fail startup. Changing
configuration must never silently reinitialize, erase, or downgrade an
existing data directory.

The Kubernetes deployment is ConfigMap-friendly: ordinary non-secret settings
such as ports, database host, database name, timeout values, logging level, and
supervisor policy are represented as ConfigMap keys or explicit environment
variables. Credentials are never stored in a ConfigMap; they are supplied from
a Kubernetes Secret using `secretKeyRef` or a mounted secret file.

Mandatory production settings are declared in GitOps, including cluster name
and address, node name/address, unique `server_id`, storage identity, resource
limits, security context, probe timings, and traffic role. Safe image defaults
are limited to protocol defaults such as ports, polling intervals, and log
format. Image defaults must not supply cluster identity, credentials, bootstrap
authority, storage paths, or production resource policy.

The initial configuration includes:

- `MARIADB_HOST`
- `MARIADB_PORT` (default `3306`)
- `MARIADB_USER`
- Secret-file references for `MARIADB_PASSWORD` and SST credentials; secret
  values are not ordinary configuration variables
- `MARIADB_DATABASE`
- `GALERA_QUERY_TIMEOUT_MS`
- `PORT` for the HTTP service

Galera node identity settings include `server_id`, `GALERA_NODE_NAME`, and
`GALERA_NODE_ADDRESS`. The deployment must provide a distinct identity for
each StatefulSet member. Node identity is deployment configuration; the image
must not derive a production identity from an unsafe shared default.

Configuration is validated before MariaDB or the HTTP service performs external
work. Invalid or missing required settings fail closed with a clear, redacted
diagnostic.

## 10. Security

- Never log passwords, connection URLs containing passwords, secret files, or
  private TLS key material.
- Never render `wsrep_sst_auth`, database passwords, or other credentials into
  world-readable generated MariaDB configuration. Secret material must be
  supplied through protected files or environment handling with documented
  permissions and must not be copied into ordinary ConfigMaps.
- Keep administrative capabilities out of the probe interface.
- Bind the service according to the deployment network policy and expose only
  the required port.
- Use least-privilege database credentials for health/statistics queries.
- TLS is not part of the initial production interface. It remains optional
  library capability only and is not a production requirement.
- If HTTPS is enabled, certificates and private keys are supplied through a
  Kubernetes Secret volume managed by cert-manager, not embedded in the image
  or ConfigMap. The deployment must allow cert-manager rotation to update the
  mounted material without rebuilding the image.
- Certificate trust roots, hostname verification, reload behavior, and VyOS
  client validation must be specified and tested before HTTPS is enabled.
- Any future external HTTPS requirement must specify certificate validation,
  trust roots, rotation, and VyOS client behavior before implementation.

SST credentials use a Kubernetes Secret mounted as a dedicated 0600 file
readable only by the MariaDB service identity. The supervisor passes only the
file location or non-secret option reference; it never places the credential in
arguments, generated ordinary configuration, logs, diagnostics, health
responses, or crash reports. Rotation is tested as a controlled credential
reload/reconciliation operation, not an automatic simultaneous cluster
restart. Recovery must have an independent Secret/key path when Kubernetes is
unavailable.

## 11. Lifecycle and failure behavior

The supervisor must distinguish these states in logs and readiness behavior:

- starting
- database-running
- database-authenticated
- Galera joining or state transfer
- Galera synchronized and Primary
- ready
- stopping
- failed

Readiness is false until the final ready state. Shutdown is idempotent and has
a bounded grace period. A MariaDB crash may be restarted only under the
configured bounded recovery policy; recovery exhaustion must leave the
container failed rather than restarting forever.

## 12. Observability

Logs are structured where practical and use reason categories such as:

- `config`
- `connect`
- `auth`
- `query`
- `state`
- `supervisor`
- `shutdown`

Logs must help an operator distinguish an unreachable database, rejected
credentials, a failed query, a non-Primary component, state transfer, and a
supervisor failure without revealing secrets.

Prometheus metrics are deferred from the initial release; structured logs are
the required diagnostic output.

The deployment observability contract must distinguish database health,
application readiness, Galera quorum, backup health, and access
reconciliation health. The dashboard and alerts must cover cluster size,
Primary status, node state, replication lag, conflicts, flow control, SST/IST,
disk pressure, backup age, restore verification, restart loops, and credential
reconciliation.

## 13. Testing requirements

Tests must cover, with dependency injection where possible:

- Configuration validation and secret redaction.
- MariaDB connection success and failure.
- Authentication rejection.
- Query failure and malformed responses.
- `Synced`, `wsrep_ready=ON`, and `Primary` readiness.
- Non-Primary, donor, joining, joined, desynchronized, and state-transfer
  behavior.
- Liveness versus readiness semantics.
- Slow and hung database checks and request deadlines.
- MariaDB crash, bounded restart, restart exhaustion, and clean shutdown.
- Signal forwarding and child cleanup.
- Concurrent HTTP clients.
- Exact HTTP status/body behavior expected by the VyOS adapter.
- Container startup and configuration smoke tests.

Live integration tests must be opt-in and use supplied test endpoints or a
disposable test cluster. They must never contain production credentials.

Storage testing is mandatory. The three-node test must use the production
storage class or a documented representative equivalent and exercise volume
mode, filesystem behavior, fsync durability, latency, disk pressure, disk-full
handling, volume replacement, recovery, and Kubernetes rescheduling. A
container-only test is insufficient.

DBA validation must compare source and restored clusters using schema and
configuration checksums, table/row counts, object counts, and representative
business queries. It must verify tables, indexes, constraints, views,
triggers, routines, functions, events, character sets, collations, and
application-required SQL modes.

The intended production storage topology is one independent node-local XFS
volume per Galera member, with each volume in a distinct failure domain.
MariaDB's live datadir must not use Gluster by default; Gluster is reserved for
configuration or shared operational/application data unless a separate
performance and failure analysis approves it. The selected StorageClass,
provisioner, mount options, IOPS, latency, throughput, and replica behavior
must be recorded and tested.

The deployment must preserve stable PVC identity, prevent two members from
sharing underlying storage, reject stale or wrong-node mounts, and refuse to
reuse an old member's datadir without explicit recovery authorization.

The release package must include the exact StorageClass, provisioner, binding
mode, volume mode, XFS creation and mount options, local-PV discovery and node
affinity, device identity, backing-disk/RAID/LUN type, snapshot policy, and
online-expansion or downtime procedure. A Docker named volume is not a
production-equivalent storage test.

## 14. Image and release requirements

- Use Node.js 26 or newer and native ESM.
- Pin the base image and relevant MariaDB/Galera package versions.
- Keep generated, runtime, and cache state outside the source repository.
- Build reproducibly in CI and locally where practical.
- Publish deployable images with a `vX.Y.Z` tag and immutable SHA-256 digest.
- Record exact source tag, image digest, target architecture, test results,
  compatibility notes, and rollback instructions.
- Artifact/image signing and deployment-side signature verification are planned
  follow-up improvements.

Before production release, CI must generate an SBOM, scan the image and
dependencies for vulnerabilities, scan source and artifacts for secrets or
malware, verify lockfiles, record base-image provenance, and attach the exact
source commit, package metadata, image digest, and test results. Signing or a
signed attestation is required before production promotion unless explicitly
risk-accepted.

## 15. Compatibility and migration

### Local test topologies

The repository must provide one image definition usable in a disposable
single-node Docker test and a disposable three-node Galera Docker test. The
three-node fixture identifies exactly one explicit bootstrap node through
Compose configuration. This is test-fixture orchestration only; the application
must not expose or perform automatic production bootstrap logic. Each topology
uses isolated named volumes and development-only credentials.

Before any production migration, the final candidate image must be used to
stand up an isolated three-node cluster locally. A controlled copy of all
required production schemas and data must be imported, along with the access
catalog and protected credential material needed to recreate users and grants.
Local instances of affected applications must connect using test Secret
mappings and pass representative authentication, reads, writes, migrations,
and failure/restart checks. Production endpoints and plaintext production
secrets must never be used in the repository or written to logs. This is a
release and migration gate, not an optional smoke test.

No MariaDB/Galera compatibility matrix is currently certified. The intended
future matrix is:

- MariaDB 10.6 + Galera 4
- MariaDB 10.11 + Galera 4
- MariaDB 11.4 + Galera 4
- The production MariaDB/Galera version selected for migration

Two-member operation is tolerated for reads only when both members are Primary
and read-eligible under the approved policy. It is not a supported
single-writer state unless the explicit writer designation and quorum policy
both pass. Conflicting writer designations, loss of quorum, or uncertain
partition state remove all writer eligibility and require operator recovery.

Two ready Primary members may continue serving temporarily for continuity, but
this is degraded operation and must alert. Fewer than two ready members is a
quorum-risk condition. A non-Primary member is never ready.

Compatibility certification requires representative data, application queries,
and an approved operational migration procedure. Those migration and rollback
steps are intentionally maintained outside this image repository.

The migration must define measurable RTO and RPO targets for the database and
each dependent application, plus thresholds for replication lag, backup age,
restore duration, state transfer, disk/inode pressure, and alert delivery.

The first release excludes automatic MariaDB major-version upgrades, automatic
production bootstrap or disaster-recovery promotion, cross-region replication,
online schema-migration orchestration, automatic grant repair without
approval, and application-level data reconciliation.

## 16. Deployment compatibility contract

The image is intended to be a practical replacement for the current
`sql-galera` workload in `gitops-k8s`. The image repository owns this runtime
contract; the GitOps repository owns the Kubernetes resources that consume it.

### Container contract

The image must:

- run on the standard `node:26-bookworm-slim` family;
- start the Node supervisor as PID 1;
- run MariaDB as the supervised foreground child process;
- expose MariaDB on TCP `3306`;
- expose the health service on a documented HTTP port, default `8080`;
- expose Galera replication on TCP/UDP `4567`;
- expose IST on TCP `4568`;
- expose SST on TCP `4444`;
- store database state under `/var/lib/mysql`;
- tolerate a persistent volume mounted at that path;
- receive configuration through environment variables and mounted files;
- emit operational logs to stdout/stderr;
- handle SIGTERM and SIGINT without corrupting or deleting database data.

The image must not require an init container to download a checker, an external
Node runtime, a MySQL client on the host, or a web console.

The intended VyOS integration is direct HTTP from each router to a per-node
health endpoint on the dedicated health port, restricted by NetworkPolicy and
firewall rules to the router/checking sources. It is not a TCP-only check, a
metrics check, or a command executed on VyOS. The exact URL, response contract,
source addresses, and timeout are versioned in the migration network artifact.

### Kubernetes expectations

The intended deployment is a three-member StatefulSet with stable identities
and a headless Service. The image must work with pod names equivalent to:

```text
sql-galera-0
sql-galera-1
sql-galera-2
```

The image must not derive bootstrap authority from those names. Cluster
addresses, node identity, cluster name, bootstrap mode, resource settings,
anti-affinity, storage, and Services are deployment configuration rather than
image defaults.

The image must support Kubernetes:

- `startupProbe` or an equivalent startup grace period;
- liveness checks that test supervisor/service liveness only;
- readiness checks that require the complete Galera readiness model;
- termination grace periods long enough for MariaDB shutdown;
- retained persistent volumes;
- ConfigMap-provided nonsecret settings;
- Secret-provided credentials;
- a read-only configuration mount;
- separate writable data and temporary/runtime locations.

The Kubernetes defaults are `runAsNonRoot: true`, UID/GID `999:999`,
`fsGroup: 999`, `allowPrivilegeEscalation: false`, all capabilities dropped,
`readOnlyRootFilesystem: true`, RuntimeDefault seccomp, and the enforced
AppArmor baseline. Writable mounts are limited to data, runtime, and temporary
paths. The service account has no permissions beyond those explicitly required
by the deployment, and NetworkPolicy permits only approved client,
router-check, monitoring, and inter-member traffic.

The intended StatefulSet uses `podManagementPolicy: OrderedReady`, a
controlled rollout strategy, hard anti-affinity or topology spread across
distinct XCP hosts, and a PodDisruptionBudget that preserves quorum. It must
define startup, liveness, and readiness timings, `fsGroup`/ownership behavior,
termination grace sufficient for a graceful Galera leave, PVC expansion, and
disk-pressure response. Resource and security settings must be rendered and
validated in GitOps CI.

Kubernetes may restart a failed member under the bounded supervisor policy,
but must not infer bootstrap or force recovery from readiness failure. One or
two failed members, quorum loss, host outage, PVC loss/corruption, failed
SST/IST, non-Primary state, and stale data must have explicit operator
handling. Readiness must remove unsafe members from traffic without creating
an automatic recovery loop.

Bootstrap/recovery requires a separate Argo overlay and an auditable Job or
`galera-cli` invocation. It must confirm cluster identity, stopped writers,
authoritative data, and a single in-progress recovery operation.

### Configuration compatibility

The replacement must provide a documented mapping from the current deployment
settings to the new image. The following settings are required or supported by
the image contract:

```text
MARIADB_ROOT_PASSWORD
MARIADB_USER
MARIADB_PASSWORD
MARIADB_DATABASE
MARIADB_HOST
MARIADB_PORT
MARIADB_DATA_DIR
MARIADB_CONFIG_FILE
GALERA_CLUSTER_NAME
GALERA_CLUSTER_ADDRESS
GALERA_NODE_NAME
GALERA_NODE_ADDRESS
GALERA_BOOTSTRAP
GALERA_QUERY_TIMEOUT_MS
PORT
LOG_LEVEL
```

`GALERA_BOOTSTRAP` is false by default. If enabled, it is an explicit request
to start a new component and must not be inferred or persisted automatically.
It is intended for disposable fixtures and controlled recovery procedures.

The image must clearly distinguish image initialization variables from runtime
variables. A variable that changes an existing data directory must never
silently reinitialize, erase, or downgrade that directory.

### Service and probe compatibility

The image must not require callers to understand internal MariaDB or Galera
state. Callers use:

```text
GET /healthz  -> 200 and `ok\n` when the supervisor is alive
GET /readyz/read  -> 200 and `ready\n` only when read-eligible
GET /readyz/write -> 200 and `ready\n` only when write-eligible
Either endpoint -> 503 and `not ready\n` otherwise
```

The endpoint response must remain stable for Kubernetes probes and VyOS
`curl` checks. Diagnostics, credentials, SQL errors, and Galera details must
never be placed in those response bodies.

### GitOps boundary

Production Kubernetes manifests are maintained in `gitops-k8s`, not copied
into this repository. The corresponding deployment must replace the legacy
MariaDB image and remove the `galera-check` init container. It must preserve
the existing stable Services, per-member routing requirements, local PV
mapping, hard hostname anti-affinity, and Argo-managed reconciliation unless a
separate approved design changes them.

The image release must provide the exact image digest, supported architecture,
configuration reference, required ports, required volume paths, probe
definitions, and any migration notes needed for the GitOps change.

Production deployment must reference an immutable image digest, not only a
mutable image tag. The release process must make the digest available to the
GitOps change and record how it was verified.

The effective MariaDB and Galera configuration required for production must be
represented in GitOps-managed configuration or explicitly documented Secret
references. Image-generated defaults may provide safe base defaults, but they
must not hide safety-critical cluster, identity, logging, replication, or
authentication settings.

The release acceptance checklist must include:

- unique `server_id` on every member;
- no plaintext credentials in rendered ConfigMaps or ordinary configuration;
- immutable image digest and exact package versions;
- explicit Primary-component readiness validation;
- per-node restart, donor/state-transfer, desynchronization, isolation, and
  Non-Primary tests;
- monitoring that distinguishes individual-node loss, quorum risk, total
  outage, health-service failure, and Galera state failure.

Backend identity and node UUID validation remain intentionally delegated to
deployment configuration and networking. That delegation must be documented;
it is not a claim that the image independently verifies endpoint identity.
