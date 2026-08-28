# @eliware/elera

MariaDB/Elera container supervisor. It starts MariaDB, exposes liveness and
readiness probes, and provides the control API used by the Elera ecosystem.

The target architecture uses HAProxy as an HTTP-only proxy for supervisor
nodes. REST remains the management interface; `@eliware/elera-lib`
preferentially keeps an authenticated WebSocket open for routing events and
falls back to REST bundle refreshes. The library connects directly to MariaDB;
HAProxy does not proxy raw MySQL traffic.

## Development

Requires Node.js 26 and Docker Desktop for the container smoke tests.

```bash
npm ci
npm test
npm run lint
npm run check
```

The production image uses this repository as its Docker build context:

```bash
docker build -f Dockerfile -t eliware/elera:local .
```

The Compose lab intentionally uses the workspace parent context so its
development Dockerfile can also build the adjacent CLI and simulator images.

The supervisor and backup workstation consume the published
`@eliware/elera-lib@0.1.3` package. They do not copy or build a sibling library
checkout into the image or CI workspace.

The local `.env` is ignored and should be created from `.env.example`. The
supervisor HTTP API listens on `8080`; MariaDB listens on `3306`. Elera is
enabled with `ELERA=1`.

This `0.1.5` release is a development and Docker-lab baseline. Production
deployment still requires the Kubernetes manifests, NetworkPolicies, secret
delivery, and operational acceptance checks described in the feature
checklist.

## Local backup and restore lab

The seven-service `lab` profile models the production topology: three Elera
nodes, the standalone `elera-single` restore target, an HTTP-only HAProxy VIP,
a `backup-dev` workstation running `elera-cli`, and a `backup-nas` SSH target.

The PowerShell launcher removes all lab volumes before each run, builds the
local images, starts all four supervisors in pending-init mode, waits briefly,
then starts HAProxy, NAS, and the dev workstation E2E runner:

```powershell
node ./scripts/lab-e2e.mjs
```

Use `node ./scripts/lab-e2e.mjs --no-build` only when the local images are already
known to be current. The dev workstation reaches the cluster API through
`http://haproxy:8080`, stores working backups in its named state volume, and
the NAS is available as `backup-nas:22` (host port `2222`). The E2E flow uses
the root token only for explicit provisioning, then gives the sample app only
its scoped token; it obtains a routing bundle, maintains the routing stream,
and logs the actual SQL node and query outcome once per second.

The runner performs the explicit first-node bootstrap, member joins,
standalone initialization, metadata and credential provisioning, routing and
drain checks, backup verification, NAS transfer, and restore verification.
It does not rely on automatic Galera bootstrap or MariaDB initialization.

For a fresh lab, the supervisor containers initially refuse normal SQL startup
until the runner explicitly initializes them. The runner then verifies
their Primary/Synced state and explicitly joins the remaining members.
Existing volumes must never be bootstrapped just because a service starts.

Stop the lab without deleting its simulated VM/NAS state with:

```bash
docker compose --profile lab stop
```

## Documentation

- [API checklist](docs/api.md)
- [API contracts](docs/api-contracts.md)
- [Feature checklist](docs/feature-checklist.md)

## Security

Do not commit `.env`, root tokens, database passwords, or generated runtime
state. Control API operations use `ROOT_TOKEN` during the current lab phase.
The container runs as the image's non-root `mysql` user. Its image-owned
runtime directories are prepared during the build; Kubernetes supplies group
ownership for the persistent data volume with `fsGroup`. Kubernetes deployments
must provide writable `/run/elera` runtime storage separately from any
read-only `/etc/elera` ConfigMap mount.

See [the runtime contract](docs/runtime-contract.md) and [release evidence](docs/release-evidence-0.1.4.md)
for the startup safety rules, filesystem requirements, and release-evidence
status.

### Local end-to-end lab

The lab always starts from clean Docker volumes. It starts all four supervisors
first, then starts HAProxy, the backup NAS, and the `backup-dev` E2E runner.
The runner performs initialization, Galera bootstrap and joins, metadata and
credential provisioning, sample-client routing/drain checks, and backup
verification. Run it from PowerShell with:

```powershell
node ./scripts/lab-e2e.mjs
```

Use `-NoBuild` only when the local images are already known to be current.
The lab is intentionally independent of GitOps and uses lab-only credentials.
