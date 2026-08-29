# Cold recovery contract

Cold recovery is a coordinated startup mode, not a side effect of a missing
peer. Each supervisor reads its local `grastate.dat`; when its persisted
sequence number is `-1`, it obtains a recovered position from `wsrep-recover`.
Supervisors exchange the complete evidence set, require matching Galera UUIDs,
select one unique highest-sequence candidate (or the sole valid
`safe_to_bootstrap` candidate), and derive a recovery epoch from that evidence.

Only the candidate that acquires a quorum-backed lease for that epoch may start
with `--wsrep-new-cluster`. Every other member starts join-only. A missing
member, conflicting UUID, equal candidates, unavailable sequence numbers,
stale/foreign data, or lost quorum leaves the cluster non-Primary and requires
explicit operator recovery. No ordinary startup edits state files, deletes
data, runs `mariadb-install-db`, forces `safe_to_bootstrap`, or invokes
`galera_new_cluster`.

The recovery decision is persisted under the runtime state directory. The
supervisor exposes its state through status and readiness responses. Readiness
is not granted until the local node is `Synced` in a confirmed `Primary` view.
If the authorized winner fails to form that view before the recovery timeout,
the attempt is fenced, marked `cluster-unavailable`, and MariaDB is stopped.

Fresh initialization and destructive recovery remain explicit authenticated
operator workflows and are separate from automatic controlled cold recovery.
