# Supervisor routing-event contract

The supervisor publishes JSON routing events on the routing event bus and
WebSocket stream. `generatedAt` is an RFC 3339/ISO-8601 UTC timestamp produced
by `new Date(...).toISOString()`. `version` is a non-negative monotonic integer
within the event stream; it is not a timestamp, and consumers must not compare
versions across independent streams.

Every event has a string `type`. Authenticated lease/refresh responses contain
the complete Bundle v1 payload. Broadcast snapshots use the distinct,
credential-free `routing.topology` event; `routing.update` is legacy.

`routing.drain` has `version`, `node`, `context`, and `generatedAt`. The
`context` object contains `nodeIdentity`, `reconnectDeadlineMs`, and optional
`loadBalancerEndpoint`. `reconnectDeadlineMs` is an integer duration in
milliseconds, sourced from the supervisor shutdown timeout.

`routing.recovery` has the same nested `context` shape as `routing.drain` and
is sent only after the local readiness policy reports ready. `routing.shutdown`
has `version`, `generatedAt`, `node`, `reason`, `reconnect: true`,
`nodeIdentity`, optional `loadBalancerEndpoint`, `reconnectDeadlineMs`, and
optional `clusterCondition`.

Representative fixtures are maintained in
`tests/fixtures/routing-events.json`. The fixture values are illustrative;
consumers must not depend on the sample timestamps or IDs.

## Credential-free topology event

The cross-repository event for unscoped broadcast updates is `routing.topology`.
Its envelope contains `type`, positive monotonic `version`, UTC ISO-8601
`generatedAt`, `node`, `context`, and `topology`. Context contains
`nodeIdentity`, integer `ports`, `clusterCondition`, and optional
`refreshAfter`; topology contains node availability records. It contains no
database name, identity, username, password, token, or Bundle fields.

Versions start at 1, are scoped to the cluster/application topology stream,
and are persisted for replay. Replay returns the latest event; resync requests
a fresh snapshot. `refreshAfter` is a hint only and never authorizes SQL.
Positive and negative fixtures are in `tests/fixtures/routing-topology/`.

All ports use the shared integer range 1–65535. SQL 3306 and HTTP 8080 are
supervisor deployment defaults only, not schema restrictions.

## Cross-repository decisions

`routing.update` must not be used as a token-bound credential event: the
supervisor broadcasts snapshots without an authenticated token/database
context. The interoperable model is a separate credential-free topology event
for broadcast updates, while token-bound Bundle v1 payloads are returned only
by authenticated lease/refresh APIs. The shared `elera-lib` event validator
accepts the topology event; it is not a token-bound bundle and must not contain
credentials or application/database identity.

Bundle and route ports remain integer values from 1 through 65535. Supervisor
defaults such as SQL 3306 and HTTP 8080 are deployment defaults only and are
not schema restrictions.

The supervisor assigns positive monotonic versions beginning at 1 and persists
the event sequence for replay across restarts. CLI migration remains orchestration over existing
application, database, identity, token, and status APIs. The first milestone
does not add a migrate endpoint or asynchronous polling API.
