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

The production image uses the workspace parent as its Docker build context:

```bash
docker build -f elera/Dockerfile -t eliware/elera:local .
```

The supervisor and backup workstation consume the published
`@eliware/elera-lib@0.1.0` package. They do not copy or build a sibling library
checkout into the image or CI workspace.

The local `.env` is ignored and should be created from `.env.example`. The
supervisor HTTP API listens on `8080`; MariaDB listens on `3306`. Elera is
enabled with `ELERA=1`.

This `0.1.0` release is a development and Docker-lab baseline. Production
deployment still requires the Kubernetes manifests, NetworkPolicies, secret
delivery, and operational acceptance checks described in the feature
checklist.

## Local backup and restore lab

The seven-service `lab` profile models the production topology: three Elera
nodes, the standalone `elera-single` restore target, an HTTP-only HAProxy VIP,
a `backup-dev` workstation running `elera-cli`, and a `backup-nas` SSH target.

```bash
docker compose --profile lab build
docker compose --profile lab up -d
```

The dev workstation reaches the cluster API at `http://haproxy:8080`, stores
working backups in its named state volume, and reaches the standalone restore
target at `elera-single:3306`. The NAS is available as `backup-nas:22` from
the lab and on host port `2222`.

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

