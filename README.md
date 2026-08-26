# galera

Minimal MariaDB/Galera container supervisor for Eliware infrastructure.

The service will run as container PID 1, supervise the local MariaDB process,
and expose narrowly scoped Kubernetes liveness and readiness endpoints. Galera
bootstrap, cluster formation, and administrative control are intentionally out
of scope and will be performed manually through a separate operational
procedure. This repository will not contain a web console.

## Development

Uses the standard Eliware `node:26-bookworm-slim` base image. Releases pin the
base image by digest.

```sh
npm ci
npm run check
npm test
npm run lint
npm run audit
```

Runtime configuration is represented by `.env.example`; credentials must be
provided by the deployment environment and never committed.

Kubernetes non-secret settings belong in a ConfigMap. Database credentials and
TLS private material belong in Secrets, with cert-manager-managed certificates
mounted as projected Secret volumes so they can rotate independently of the
image.

## Dependencies

- `@eliware/common` supplies shared logging, path, error, and signal/lifecycle
  APIs.
- `@eliware/mysql` supplies injectable MySQL connection pools and queries for
  Galera health and statistics.

## Operations

`/healthz` will represent supervisor liveness. `/readyz/read` will return
success only when MariaDB is reachable and Galera is `Synced`,
`wsrep_ready=ON`, and in the `Primary` component. `/readyz/write` will also
require the node's explicit write-eligibility policy. Health endpoints must
not expose credentials or provide cluster-bootstrap controls.

## Local Docker topologies

The same image supports disposable single-node and three-node local tests:

```sh
docker compose --profile single up --build
docker compose --profile cluster up --build
```

The cluster profile designates `galera-1` as the explicit local bootstrap node.
These credentials, named volumes, and ports are for local testing only.
