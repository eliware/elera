# galera project instructions

This repository contains a minimal MariaDB/Galera container supervisor.

- Use Node.js 26 and native ESM.
- Keep PID 1 lifecycle wiring in `src/main.mjs`; keep configuration, process
  supervision, HTTP probes, and database checks in focused modules.
- Use `@eliware/common` for logging, paths, errors, and signal/lifecycle APIs.
- Use `@eliware/mysql` for MariaDB connections and status/statistics queries.
- Do not add bootstrap automation, a web console, or administrative network APIs.
- `/healthz` is liveness; `/readyz` is traffic readiness.
- Never log credentials or commit environment files/secrets.
- Run `npm test`, `npm run lint`, and `npm run check` before committing.
