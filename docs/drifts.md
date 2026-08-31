# Supervisor alignment drifts

Checklist against `elera-lab/core_flow.md`, `docs/supervisor_plan.md`, and the
applicable repository conventions. This is an audit record, not an assertion
that the implementation is complete.

## Current status

- [x] Local drain/lifecycle policy ownership and root-socket administration boundary are established.
- [x] The client dependency is intentionally development-only.
- [x] Recovery authority, lifecycle validation, and final supervisor gates are verified locally; runtime lab validation remains separate.
- [x] Source-to-test audit found no non-barrel implementation module without a
  focused test; six missing direct paths are documented intentional
  barrels/entrypoints/orchestrators.
- [x] Focused cold-recovery, observation, durable-store, and lifecycle tests
  pass with 100×4 coverage.
- [x] The previously reported recovery/data-directory coverage gaps are
  covered by focused tests.
- [x] Added focused edge-case coverage for candidate selection, recovery
  parsing, state files, and data-directory safety; targeted recovery tests
  now exercise the previously reported branches.

## Actionable drifts

- [ ] Replace the temporary `file:../elera-lib` dependency with the published
  package before any release or deployment handoff; retain local linking only
  for development.
- [ ] Reconcile `docs/api-contracts.md` with the final no-legacy policy. Its
  compatibility/versioning section must describe only intentional protocol
  versioning, not support for obsolete formats or fallback behavior.
- [x] Removed the ambient `ELERA_CLUSTER_BOOTSTRAP` argument fallback. Bootstrap
  authority now comes from the explicit startup/recovery decision passed through
  the coordinator; the environment variable remains only for the internal
  pending-initialization handoff.
- [x] Completed the thin composition-root refactor; `src/main.mjs` is now the
  dependency-wiring entrypoint. The README documents the supervisor/application/CLI/GitOps operations boundary.
- [x] Runtime SQL client composition is published into shared state before
  readiness and control routes execute; invalid health query results fail
  closed, and initialization does not report success when metadata migration
  fails.
- [x] App-admin provisioning uses the canonical database, identity, and token
  endpoints with application-scoped authorization; unauthorized applications
  remain fail-closed.
- [ ] Verify every recovery observation is authenticated, epoch-bound,
  evidence-digested, quorum-authorized, and rejected when stale or changed.
- [ ] Verify winner-only bootstrap, join-only followers, Primary verification,
  and clean-restart rejoin behavior with implementation-level tests.
- [ ] Verify shutdown ordering, operation rejection, drain events, MariaDB
  SIGTERM handling, timeout force-kill, and listener closure end to end.
- [ ] Verify the one-second health/assignment cycle and ten-second telemetry
  aggregation use cached state and never query SQL from probe handlers.
- [x] Added focused coverage for the supervisor drain-timeout policy uncovered
  by the current suite.
- [x] Reconciled the supervisor’s bundle and event validation with the shared
  `elera-lib` contracts, including credential-free `routing.topology` events.
- [x] Regenerated the source-to-test inventory and proved every non-barrel
  module has a matching focused test; cross-cutting tests remain integration
  only.
- [x] Current supervisor `npm test` passes with 100×4 coverage and zero lint
  warnings; the broader source/test inventory remains under review.
- [x] Full supervisor suite re-run passes with 100×4 coverage and zero lint
  warnings.
- [x] Candidate selection now fails closed when multiple nodes have the same
  highest recovered sequence number; hostname ordering is never used as
  recovery authority.
- [x] Recovery authorization now requires distinct, identified quorum-member
  acknowledgements; numeric counts and duplicate acknowledgements are rejected.
- [x] Authenticated peer evidence is now checked against the expected node
  identity before it enters recovery planning or epoch creation.
- [x] An already-active Primary peer now produces a join-ready startup decision,
  so a cleanly restarted member starts MariaDB without bootstrap authority.
- [x] Join verification requires the expected cluster identity, `Primary` view,
  `Synced` local state, readiness, and expected membership size.
- [~] Local lab runtime check: all three cluster supervisors start without
  restarts, but the fresh data directories are intentionally uninitialized;
  health/readiness remain `503` and Galera ports are not listening. Real
  SST/IST and rejoin validation require the explicit initialization workflow.
- [~] Quorum rejects stale observations, conflicting cluster identities, and
  conflicting Primary views, and the coordinator refuses assignment changes
  without quorum. Authenticated epoch-bound evidence, winner-only runtime
  bootstrap, and cold-recovery/lab validation remain open.
- [x] Ran the full local supervisor gates: tests, lint, typecheck, contracts,
  audit, syntax, and package dry-run. CI verification on Ubuntu and Windows
  remains a CI responsibility.
- [ ] Refresh release evidence and runtime/API/recovery documentation so old
  candidate limitations are clearly historical rather than current claims.

## Verified or intentional boundaries

- [x] The supervisor configuration uses its local drain/lifecycle policy
  implementation; client-side drain behavior remains owned by the client.

- [x] Supervisor owns Galera state, quorum, recovery authority, routing
  assignments, metadata administration, and the local root-socket SQL path.
- [x] `elera-client` remains a development/integration dependency only; the
  supervisor does not use it for administrative SQL.
- [x] Application-facing provisioning and SQL pool behavior remain outside
  supervisor, in CLI and client respectively.
- [x] Authenticated routing bundle retrieval derives application, database, and
  identity from the runtime token context; cross-application mismatches fail
  closed.
- [x] Core Flow remains generic and does not expose supervisor recovery
  internals.
