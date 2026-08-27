import { createDbFromBundle, createRoutingStream } from '@eliware/elera-lib';

const endpoint = process.env.ELERA_API_ENDPOINT;
const token = process.env.ELERA_API_TOKEN;
const identity = process.env.ELERA_IDENTITY;
const application = process.env.ELERA_APPLICATION ?? 'sample-app';
if (!endpoint || !token || !identity) throw new Error('sample app requires endpoint, scoped token, and identity');

async function fetchBundle() {
  const response = await fetch(endpoint.replace(/\/$/, '') + '/api/v1/routing/bundle?identity=' + encodeURIComponent(identity), {
    headers: { accept: 'application/json', authorization: 'Bearer ' + token },
  });
  if (!response.ok) throw new Error('routing bundle request failed: ' + response.status);
  const body = await response.json();
  return body.data ?? body;
}

const bundle = await fetchBundle();
const db = await createDbFromBundle({ bundle, identity });
const stream = createRoutingStream({
  endpoint,
  token,
  application,
  fetchBundle: async () => fetchBundle(),
  onUpdate: (event) => console.log(JSON.stringify({ event: event.type, version: event.version, routes: event.bundle?.routes })),
  onError: (error) => console.warn(JSON.stringify({ event: 'routing.error', error: error.message })),
});
await db.attachRoutingStream(stream);
await stream.connect();

let running = true;
const tick = async () => {
  if (!running) return;
  try {
    const [rows] = await db.query('SELECT 1 AS healthy, @@hostname AS node, @@wsrep_local_state_comment AS wsrep_state, @@wsrep_cluster_status AS cluster_status');
    console.log(JSON.stringify({ event: 'sql.probe', bundleVersion: db.bundle()?.bundleVersion, route: db.classify('SELECT 1'), node: rows[0]?.node, wsrepState: rows[0]?.wsrep_state, clusterStatus: rows[0]?.cluster_status }));
  } catch (error) {
    console.warn(JSON.stringify({ event: 'sql.error', error: error.message, nodes: db.nodeStates() }));
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
