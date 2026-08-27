# @eliware/galera

MariaDB/Galera container supervisor. It starts MariaDB, exposes liveness and
readiness probes, and provides the control API used by the developing Galera
ecosystem.

## Development

Requires Node.js 26 and Docker Desktop for the container smoke tests.

```bash
npm ci
npm test
npm run lint
npm run check
```

The local `.env` is ignored and should be created from `.env.example`. The
supervisor currently exposes HTTP on `8080` and transitional TCP agent ports
`33060` and `33070`. Galera is enabled with `GALERA=1`.

## Security

Do not commit `.env`, root tokens, database passwords, or generated runtime
state. Control API operations use `ROOT_TOKEN` during the current lab phase.
