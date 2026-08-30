# Supervisor Architecture Plan

## Purpose

The supervisor turns MariaDB/Galera into a managed service for Kubernetes and
local development. It owns cluster authority, lifecycle, routing decisions,
metadata administration, and the local MariaDB process. Applications use the
separate `@eliware/elera-client` package; they do not use supervisor internals.

This document contains supervisor implementation details intentionally omitted
from `elera-lab/core_flow.md`. Core Flow defines service behavior and
operator/application workflows; this plan defines how this supervisor realizes
those behaviors.

## Target architecture

```text
Supervisor process
├── Runtime composition
│   ├── configuration
│   ├── dependency wiring
│   └── process lifecycle
├── Control plane
│   ├── authentication and authorization
│   ├── initialization
│   ├── metadata/provisioning
│   ├── routing bundles
│   ├── telemetry
│   └── CLI/API routes
├── Cluster plane
│   ├── local MariaDB state
│   ├── peer observations
│   ├── quorum evaluation
│   ├── writer assignment
│   └── cold-recovery coordinator
├── Data plane
│   ├── MariaDB process
│   ├── local root-socket SQL client
│   └── health/readiness probes
└── Lifecycle plane
    ├── startup
    ├── drain/quiesce
    ├── SIGTERM shutdown
    ├── restart/rejoin
    └── timeout/force-kill
```

## Ownership boundaries

- MariaDB owns SQL execution.
- Supervisor owns authority, lifecycle, cluster state, and routing decisions.
- `elera-lib` owns shared contracts and helpers.
- `elera-client` owns application SQL pools and client-side failover.
- CLI owns administrative workflows and SQL command passthrough.
- Persisted intent owns startup-critical configuration.
- Runtime state owns mutable health, routing, telemetry, and recovery state.

## Recovery model

The cold-recovery coordinator is the only component allowed to authorize a
cluster bootstrap. Recovery is an explicit state machine:

```text
observing → candidate-selected → quorum-authorized → bootstrapping
          → primary-verified → join-enabled → complete
```

Conflicting or incomplete evidence transitions to `blocked`; it must never
trigger an automatic bootstrap fallback.

Each supervisor publishes authenticated observations containing:

- node identity;
- cluster identity;
- local Galera state;
- sequence number;
- `safe-to-bootstrap` state;
- recovered sequence number;
- data-directory evidence;
- observation epoch and timestamp.

Quorum must agree on the exact recovery epoch, winner, cluster identity, and
evidence digest before bootstrap. Only the elected winner starts MariaDB with
bootstrap arguments. Other nodes remain stopped or join-only until the winner
proves `Primary` and expected membership.

Clean restart and cold recovery are distinct paths. A cleanly stopped member
rejoins normally without entering bootstrap selection.

Startup must refuse missing or invalid data, conflicting cluster identity,
ambiguous sequence numbers, changed evidence after authorization, insufficient
quorum, and failed Primary formation.

## State separation

Keep three classes of state separate:

1. Persisted intent: cluster membership, MariaDB settings, and startup-critical
   configuration.
2. Durable recovery state: recovery decisions, epochs, evidence digests, leases,
   and audit records.
3. Ephemeral runtime state: health, routing, telemetry, and current lifecycle.

## Routing and telemetry

All supervisor SQL administration uses the local root socket. The supervisor
does not use `elera-client` for administration; that package may remain a
development/integration dependency for consumer-style tests only.

A single routing-assignment service should consume validated observations and
metadata, then emit versioned bundles and explicit events:

- `routing.update`;
- `routing.drain`;
- `routing.recovery`;
- `routing.shutdown`.

The health and assignment cycle runs approximately once per second. Telemetry
aggregation runs approximately once per ten seconds. Routing state and
telemetry must not require SQL queries from health probes.

## Lifecycle ordering

Shutdown ordering must be deterministic:

```text
reject new control work
→ publish shutdown/drain event
→ quiesce SQL
→ SIGTERM MariaDB
→ wait configured timeout
→ SIGKILL only if necessary
→ close HTTP/WebSocket listeners
```

`/healthz` remains available during drain and is independent of SQL. `/readyz`
reports non-ready while draining, recovering, or lacking the required Galera
state.

## Implementation plan

1. Split `src/main.mjs` into a thin composition root and focused startup,
   runtime, and shutdown coordinators.
2. Formalize the cold-recovery state machine and make its coordinator the sole
   bootstrap authority.
3. Separate persisted intent, durable recovery/audit state, and ephemeral
   runtime state.
4. Validate and authenticate peer observations, including sequence and data
   directory evidence.
5. Require quorum agreement on recovery epoch, winner, cluster identity, and
   evidence digest.
6. Enforce winner-only bootstrap, join-only followers, and Primary/membership
   verification before completion.
7. Preserve ordinary clean restart as a normal rejoin path.
8. Centralize routing assignment and versioned bundle/event publication.
9. Keep the one-second routing cycle separate from ten-second telemetry
   aggregation.
10. Make shutdown rejection, event publication, SQL quiescing, MariaDB signal
    handling, timeout, and listener closure deterministic.
11. Keep supervisor administration on the local root socket and preserve the
    client dependency boundary.
12. Distinguish operational safety fallbacks from prohibited legacy
    compatibility behavior.
13. Align every non-barrel implementation module with a focused test, while
    retaining deliberate composition and cross-cutting exceptions.
14. Update runtime, API, recovery, and release documentation to match the
    authority model.
15. Record intentional exceptions in `known_drifts.md`.

## Validation gates

Before committing the plan implementation:

- run the complete supervisor suite and verify 100×4 coverage;
- run lint, typecheck, contract validation, audit, and package checks;
- verify CI on Ubuntu and Windows;
- test clean restart, cold recovery, quorum loss, conflicting evidence,
  winner/joiner failure, SST/IST, drain, shutdown, and rejoin behavior;
- review the final source-to-test inventory and dependency boundaries.
