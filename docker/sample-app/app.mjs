import { createDbFromBundle, createRoutingStream } from '@eliware/elera-lib';

const endpoint = process.env.ELERA_API_ENDPOINT;
const token = process.env.ELERA_API_TOKEN;
const identity = process.env.ELERA_IDENTITY;
const application = process.env.ELERA_APPLICATION ?? 'sample-app';
if (!endpoint || !token || !identity) throw new Error('sample app requires endpoint, scoped token, and identity');

async function fetchBundle() {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const response = await fetch(endpoint.replace(/\/$/, '') + '/api/v1/routing/bundle?identity=' + encodeURIComponent(identity), {
      headers: { accept: 'application/json', authorization: 'Bearer ' + token },
    });
    if (response.ok) {
      const body = await response.json();
      return body.data ?? body;
    }
    if (response.status !== 401 && response.status !== 404) throw new Error('routing bundle request failed: ' + response.status);
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new Error('routing bundle request failed after metadata convergence retries');
}

const bundle = await fetchBundle();
const db = await createDbFromBundle({ bundle, identity });
let sequence = 0;
let previousProbeAt;
const stream = createRoutingStream({
  endpoint,
  token,
  application,
  fetchBundle: async () => fetchBundle(),
  onUpdate: (event) => console.log(JSON.stringify({ event: event.type, timestamp: new Date().toISOString(), version: event.version, routes: event.bundle?.routes })),
  onError: (error) => console.warn(JSON.stringify({ event: 'routing.error', timestamp: new Date().toISOString(), error: error.message })),
});
await db.attachRoutingStream(stream);
await stream.connect();

let running = true;
const tick = async () => {
  if (!running) return;
  const startedAt = new Date();
  const started = performance.now();
  const currentSequence = ++sequence;
  try {
    const [rows] = await db.query('SELECT 1 AS healthy, @@hostname AS node, @@wsrep_local_state_comment AS wsrep_state, @@wsrep_cluster_status AS cluster_status');
    const finishedAt = new Date();
    console.log(JSON.stringify({ event: 'sql.probe', sequence: currentSequence, startedAt: startedAt.toISOString(), finishedAt: finishedAt.toISOString(), durationMs: Math.round(performance.now() - started), gapSincePreviousMs: previousProbeAt ? Math.round(startedAt - previousProbeAt) : null, bundleVersion: db.bundle()?.bundleVersion, route: db.classify('SELECT 1'), node: rows[0]?.node, wsrepState: rows[0]?.wsrep_state, clusterStatus: rows[0]?.cluster_status, nodes: db.nodeStates() }));
    previousProbeAt = finishedAt;
  } catch (error) {
    console.warn(JSON.stringify({ event: 'sql.error', sequence: currentSequence, startedAt: startedAt.toISOString(), finishedAt: new Date().toISOString(), durationMs: Math.round(performance.now() - started), gapSincePreviousMs: previousProbeAt ? Math.round(startedAt - previousProbeAt) : null, error: error.message, code: error.code, nodes: db.nodeStates() }));
    previousProbeAt = new Date();
  }
};
const timer = setInterval(() => { void tick(); }, 1000);
await tick();

async function shutdown() {
  if (!running) return;
  running = false;
  clearInterval(timer);
  stream.close();
  await db.close();
}
process.once('SIGTERM', () => { void shutdown().finally(() => process.exit(0)); });
process.once('SIGINT', () => { void shutdown().finally(() => process.exit(0)); });
