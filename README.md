# @eliware/elera

MariaDB/Elera container supervisor. It starts MariaDB, exposes liveness and
readiness probes, and provides the control API used by the Elera ecosystem.

The target architecture uses HAProxy as an HTTP-only proxy for supervisor
nodes. REST remains the management interface; `@eliware/elera-lib`
preferentially keeps an authenticated WebSocket open for routing events and
falls back to REST bundle refreshes. The library connects directly to MariaDB;
HAProxy does not proxy raw MySQL traffic.

## Development

Requires Node.js 26.

```bash
npm ci
npm test
npm run lint
npm run check
npm run contracts
npm run audit
npm run pack
```

The production image uses this repository as its Docker build context:

```bash
docker build -f Dockerfile -t eliware/elera:local .
```

The Docker Compose lab, backup images, HAProxy configuration, E2E scenarios,
and lab launcher are maintained separately in `../elera-lab`. The supervisor
image build and publishing workflow remain in this repository.

The local `.env` is ignored and should be created from `.env.example`. The
supervisor HTTP API listens on `8080`; MariaDB listens on `3306`. Elera is
enabled by the explicit initialization workflow; an uninitialized data directory
starts in pending-init mode and does not bootstrap automatically.

This `0.1.6` release is a development and Docker-lab baseline. Production
deployment still requires the Kubernetes manifests, NetworkPolicies, secret
delivery, and operational acceptance checks described in the feature
checklist.

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

See [the runtime contract](docs/runtime-contract.md) and the versioned release-evidence documents in `docs/`.
for the startup safety rules, filesystem requirements, and release-evidence
status.

## Operations boundary

The supervisor owns MariaDB/Galera lifecycle, cluster recovery authority,
health/readiness, routing assignments, telemetry collection, metadata
administration, and the authenticated control API. Applications connect
through `@eliware/elera-client`; the CLI owns operator workflows and SQL
passthrough. Kubernetes manifests, secrets delivery, rollout, backup artifact
storage, and restore execution are maintained by the companion lab/GitOps
repositories.

Normal startup never initializes or repairs a data directory. Initialization,
bootstrap, and recovery are authenticated control-plane operations. On
shutdown, the supervisor drains routing, quiesces SQL, stops MariaDB with a
bounded timeout, and then closes its listeners. See
[`docs/runtime-contract.md`](docs/runtime-contract.md) for filesystem, ports,
probe, secret, recovery, and shutdown requirements.

