# @eliware/elera

MariaDB/Elera container supervisor. It starts MariaDB, exposes liveness and
readiness probes, and provides the control API used by the developing Elera
ecosystem.

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

The production image uses the workspace parent as its Docker build context so
it can include the sibling `elera-lib` package:

```bash
docker build -f elera/Dockerfile -t eliware/elera:local .
```

The local `.env` is ignored and should be created from `.env.example`. The
supervisor HTTP API listens on `8080`; MariaDB listens on `3306`. Elera is
enabled with `ELERA=1`. The legacy TCP agent listeners `33060` and `33070`
are transitional and will be removed with the HTTP-only migration.

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
