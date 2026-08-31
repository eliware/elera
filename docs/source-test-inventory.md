# Supervisor source-module inventory

Reviewed on 2026-08-30 from the current working tree. Total: **142** `src/**/*.mjs` files.

Classification: barrels and entrypoints/orchestrators are excluded from focused implementation coverage; every other module is an implementation module requiring a mirrored focused test under `tests/`. The two CLI wrapper modules are executable entrypoints, not reusable implementation modules.

## Barrels (2)

- `src/connection-bundle.mjs`
- `src/lifecycle/pending-init.mjs`

## Entrypoints/orchestrators (5)

- `src/control-api.mjs`
- `src/main.mjs`
- `src/lifecycle/pending-init/runtime.mjs`
- `src/lifecycle/data-directory-cli.mjs`
- `src/lifecycle/pending-init-cli.mjs`

## Implementation modules (135)

- `src/config.mjs`
- `src/health.mjs`
- `src/probes.mjs`
- `src/routing-policy.mjs`
- `src/accounts/grant-policy.mjs`
- `src/accounts/managed.mjs`
- `src/accounts/sql.mjs`
- `src/api/authentication.mjs`
- `src/api/http.mjs`
- `src/api/internal-auth.mjs`
- `src/api/routing-stream.mjs`
- `src/api/routes/accounts.mjs`
- `src/api/routes/applications.mjs`
- `src/api/routes/artifacts.mjs`
- `src/api/routes/cluster.mjs`
- `src/api/routes/cold-bootstrap-evidence.mjs`
- `src/api/routes/cold-bootstrap-local.mjs`
- `src/api/routes/cold-recovery.mjs`
- `src/api/routes/initialization.mjs`
- `src/api/routes/intent.mjs`
- `src/api/routes/managed.mjs`
- `src/api/routes/metadata.mjs`
- `src/api/routes/observations.mjs`
- `src/api/routes/reconcile.mjs`
- `src/api/routes/recovery.mjs`
- `src/api/routes/routing-admin.mjs`
- `src/api/routes/routing-resync.mjs`
- `src/api/routes/routing.mjs`
- `src/api/routes/status.mjs`
- `src/api/routes/telemetry.mjs`
- `src/api/routes/traffic.mjs`
- `src/bootstrap/lease.mjs`
- `src/cluster/bootstrap-eligibility.mjs`
- `src/cluster/drain-propagation.mjs`
- `src/cluster/durable-observation-store.mjs`
- `src/cluster/lifecycle-plan.mjs`
- `src/cluster/lifecycle.mjs`
- `src/cluster/observation-store.mjs`
- `src/cluster/observation.mjs`
- `src/cluster/peer-observations.mjs`
- `src/cluster/quorum-readiness.mjs`
- `src/cluster/quorum.mjs`
- `src/cluster/shutdown-condition.mjs`
- `src/cluster/sql-operations.mjs`
- `src/cluster/cold-bootstrap/action.mjs`
- `src/cluster/cold-bootstrap/audit.mjs`
- `src/cluster/cold-bootstrap/bootstrap-watch.mjs`
- `src/cluster/cold-bootstrap/candidate.mjs`
- `src/cluster/cold-bootstrap/completion.mjs`
- `src/cluster/cold-bootstrap/coordinator.mjs`
- `src/cluster/cold-bootstrap/decision-store.mjs`
- `src/cluster/cold-bootstrap/eligibility.mjs`
- `src/cluster/cold-bootstrap/evidence-validation.mjs`
- `src/cluster/cold-bootstrap/explicit-startup.mjs`
- `src/cluster/cold-bootstrap/idempotency-store.mjs`
- `src/cluster/cold-bootstrap/join-verification.mjs`
- `src/cluster/cold-bootstrap/lease.mjs`
- `src/cluster/cold-bootstrap/operation-lock.mjs`
- `src/cluster/cold-bootstrap/peer-evidence.mjs`
- `src/cluster/cold-bootstrap/promote-state.mjs`
- `src/cluster/cold-bootstrap/protocol.mjs`
- `src/cluster/cold-bootstrap/recovery-epoch.mjs`
- `src/cluster/cold-bootstrap/recovery-state.mjs`
- `src/cluster/cold-bootstrap/recovery.mjs`
- `src/cluster/cold-bootstrap/service.mjs`
- `src/cluster/cold-bootstrap/startup-arguments.mjs`
- `src/cluster/cold-bootstrap/startup-decision.mjs`
- `src/cluster/cold-bootstrap/startup-evidence-server.mjs`
- `src/cluster/cold-bootstrap/startup-local-evidence.mjs`
- `src/cluster/cold-bootstrap/startup-state.mjs`
- `src/cluster/cold-bootstrap/state-file.mjs`
- `src/intent/model.mjs`
- `src/intent/reconcile.mjs`
- `src/intent/render.mjs`
- `src/intent/state.mjs`
- `src/internal/admin/migrations.mjs`
- `src/internal/admin/sql.mjs`
- `src/internal/routing/bundle.mjs`
- `src/internal/sql/client.mjs`
- `src/internal/verification/sql.mjs`
- `src/lifecycle/data-directory-cli.mjs`
- `src/lifecycle/data-directory.mjs`
- `src/lifecycle/drain-events.mjs`
- `src/lifecycle/drain-manager.mjs`
- `src/lifecycle/mariadb-process.mjs`
- `src/lifecycle/pending-init-cli.mjs`
- `src/lifecycle/shutdown.mjs`
- `src/lifecycle/sql-quiesce.mjs`
- `src/lifecycle/sql-routing.mjs`
- `src/lifecycle/startup.mjs`
- `src/lifecycle/state.mjs`
- `src/lifecycle/pending-init/handoff.mjs`
- `src/lifecycle/pending-init/initialize.mjs`
- `src/lifecycle/pending-init/processes.mjs`
- `src/lifecycle/pending-init/server.mjs`
- `src/lifecycle/pending-init/sql.mjs`
- `src/metadata/accounts.mjs`
- `src/metadata/applications.mjs`
- `src/metadata/artifacts.mjs`
- `src/metadata/managed.mjs`
- `src/metadata/reconcile.mjs`
- `src/metadata/schema.mjs`
- `src/metadata/secret-box.mjs`
- `src/metadata/service.mjs`
- `src/metadata/token-authentication.mjs`
- `src/recovery/control.mjs`
- `src/routing/address-validation.mjs`
- `src/routing/assignment-store.mjs`
- `src/routing/bundle-service.mjs`
- `src/routing/client-address.mjs`
- `src/routing/decision.mjs`
- `src/routing/event-bus.mjs`
- `src/routing/event-snapshot.mjs`
- `src/routing/local-observation.mjs`
- `src/routing/metadata-assignments.mjs`
- `src/routing/quorum-assignment.mjs`
- `src/runtime/identity.mjs`
- `src/runtime/composition.mjs`
- `src/runtime/control-wiring.mjs`
- `src/runtime/cycles.mjs`
- `src/runtime/db-environment.mjs`
- `src/runtime/lifecycle-predicates.mjs`
- `src/runtime/peer-list.mjs`
- `src/runtime/probe-wiring.mjs`
- `src/runtime/peer-publisher.mjs`
- `src/runtime/cluster-wiring.mjs`
- `src/runtime/routing-composition.mjs`
- `src/runtime/routing-publisher.mjs`
- `src/runtime/runtime-state.mjs`
- `src/runtime/server-lifecycle.mjs`
- `src/runtime/shutdown-wiring.mjs`
- `src/runtime/sql-client-wiring.mjs`
- `src/runtime/startup-intent.mjs`
- `src/runtime/wsrep-recovery.mjs`
- `src/telemetry/collector.mjs`
- `src/telemetry/normalize.mjs`

## Follow-up audit

- Focused test paths mirror the source path without the `src/` segment.
- The six modules without direct mirrored tests are intentional barrels or
  entrypoint/orchestrator modules: `connection-bundle.mjs`, `main.mjs`,
  `lifecycle/pending-init.mjs`, `lifecycle/pending-init/runtime.mjs`,
  `lifecycle/data-directory-cli.mjs`, and `lifecycle/pending-init-cli.mjs`.
- No non-barrel implementation module was missing from the focused-test path
  audit.
- Cross-cutting, contract, integration, barrel, and entrypoint tests supplement but do not replace focused implementation tests.
- Re-run this inventory whenever source modules are added, removed, or reclassified.
