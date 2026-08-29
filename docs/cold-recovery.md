# Cold recovery contract

Cold recovery is a quorum-certified startup protocol. It is not inferred from
peer absence, readiness failure, or a missing data directory.

Each supervisor publishes authenticated evidence containing its Galera UUID,
saved and recovered sequence numbers, `safe_to_bootstrap`, data-directory
validity, current `Primary`/`Synced` state, evidence generation, and timestamp.
Evidence must be complete, fresh, and from the same cluster UUID.

Supervisors select the sole valid `safe_to_bootstrap` member, or otherwise the
highest recovered sequence number. A node-name tie-break is permitted only
when UUID and sequence number are identical. Conflicting histories, divergent
UUIDs, stale evidence, or insufficient quorum block recovery.

The result is an atomically persisted recovery epoch containing the cluster
UUID, evidence digest, winner, sequence number, timestamp, and quorum members.
Its legal progression is `evidence` → `authorized` → `bootstrapping` →
`complete`. Blocked epochs may only be retried after fresh evidence is
collected.

Only the exact epoch’s quorum may authorize recovery, and only its winner may
start with `--wsrep-new-cluster`. The winner must reach `Primary`, `Synced`,
and `wsrep_ready=ON` before publishing an authenticated `bootstrap-complete`
handoff. Joiners remain stopped until that matching handoff is observed, then
join normally and verify UUID, SST/IST completion, membership, and `Synced`.

Readiness remains `503` while recovery is pending, blocked, bootstrapping, or
joining. Failed bootstrap, failed SST/IST, corrupted state, stale epochs, or
lost quorum fail closed. No recovery path deletes data, runs
`mariadb-install-db`, deletes data, or mutates a suspicious data directory
implicitly. The explicit winner-only, quorum-authorized bootstrap step may
promote `safe_to_bootstrap` in `grastate.dat` immediately before starting
MariaDB with `--wsrep-new-cluster`; this is auditable and never occurs during
ordinary startup.

Recovery endpoints:

- `GET /api/v1/cluster/cold-recovery/evidence`
- `GET /api/v1/cluster/cold-recovery/status`
- `POST /api/v1/cluster/cold-recovery/plan`
- `POST /api/v1/cluster/cold-recovery/retry`
- `POST /api/v1/cluster/cold-recovery/authorize`
- `POST /api/v1/cluster/cold-recovery/bootstrap`
- `POST /api/v1/cluster/cold-recovery/complete`

Write endpoints require the recovery-write scope or authenticated internal
peer access. Evidence, decisions, authorizations, bootstrap, join, block, and
refusal outcomes are auditable.
