# Agent guidance

Use Node.js 26 native ESM and keep `src/main.mjs` as a thin wiring entrypoint.
Use `@eliware/common` for shared logging, errors, and lifecycle behavior. Keep
HTTP, health, Elera process, and control API behavior in focused modules. Put
tests under `tests/` and preserve the one-to-one source/test structure. Never
commit secrets or runtime state.
