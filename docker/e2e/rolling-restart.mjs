import { execFile } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { promisify } from 'node:util';

const exec = promisify(execFile);
const token = process.env.ROOT_TOKEN ?? readEnv('ROOT_TOKEN') ?? 'root_token_here';
const node = 'http://127.0.0.1:8081';
const peers = ['http://127.0.0.1:8082', 'http://127.0.0.1:8083'];
const debug = process.env.ELERA_E2E_DEBUG === '1';
const log = (...args) => { if (debug) console.error(...args); };

await post(node, '/api/v1/traffic/undrain');
await waitForReady(node);
await Promise.all(peers.map((peer) => waitForReady(peer)));
await waitForConvergedRoutes();
const clients = await Promise.all([0, 1, 2].map((index) => startClient(index)));
await delay(5000);
const baseline = await snapshotClients(clients);
assertTelemetry(baseline, 'baseline');
log('[rolling-e2e] baseline cluster healthy');

const drainStarted = Date.now();
await exec('docker', ['compose', 'stop', '--timeout', '60', 'elera-0'], { cwd: process.cwd() });
await Promise.all(peers.map((peer) => waitForReady(peer)));
await assertUnavailable(node);
await delay(2000);
const drained = await snapshotClients(clients, drainStarted);
assertTelemetry(drained, 'drain');
log('[rolling-e2e] drained node excluded while stopped');

const recoveryStarted = Date.now();
await exec('docker', ['compose', 'start', 'elera-0'], { cwd: process.cwd() });
// A restart with a non-empty data directory may require SST/IST before the
// supervisor can report SQL readiness. Wait for the actual ready transition,
// rather than treating HTTP availability as cluster recovery.
await waitForReady(node, 300);
await Promise.all(peers.map((peer) => waitForReady(peer)));
await assertRoute(node);
await delay(5000);
const recovered = await snapshotClients(clients, recoveryStarted);
assertTelemetry(recovered, 'recovery');
await Promise.all(clients.map((client) => client.stop()));
const allTelemetry = [...baseline, ...drained, ...recovered];
const ids = [...new Set(allTelemetry.map((probe) => Number(probe.generatedId)))].sort((a, b) => a - b);
if (ids.length < 3) throw new Error('too few auto-increment IDs observed');
if (ids.some((id, index) => index > 0 && id <= ids[index - 1])) throw new Error('auto-increment IDs were not monotonic');
log('[rolling-e2e] restarted node returned to healthy routing');

async function assertRoute(endpoint) {
  const response = await fetch(`${endpoint}/api/v1/routing/bundle?identity=sample-runtime`, { headers: { authorization: `Bearer ${token}` } });
  if (!response.ok) throw new Error(`routing bundle failed with ${response.status}`);
}

async function waitForConvergedRoutes(attempts = 30) {
  const endpoints = [node, ...peers];
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const bundles = await Promise.all(endpoints.map(async (endpoint) => {
        const response = await fetch(`${endpoint}/api/v1/routing/bundle?identity=sample-runtime`, { headers: { authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(3000) });
        if (!response.ok) throw new Error(`routing bundle failed with ${response.status}`);
        return (await response.json()).data;
      }));
      const signatures = new Set(bundles.map((bundle) => JSON.stringify({ writer: bundle.writer, failover: bundle.failover, bundleVersion: bundle.bundleVersion })));
      if (signatures.size === 1 && bundles[0]?.writer?.host) return;
    } catch {}
    await delay(1000);
  }
  await assertRoute(node);
  throw new Error('supervisors did not converge on one routing bundle');
}

async function startClient(index) {
  const errors = [];
  const { stdout: container } = await exec('docker', ['compose', 'run', '--detach', '--name', `elera-rolling-client-${index}`, '--no-deps', '--entrypoint', 'node', '-e', 'ELERA_API_ENDPOINT=http://haproxy:8080', `-e=ELERA_API_TOKEN=${token}`, '-e', 'ELERA_IDENTITY=sample-runtime', '-e', 'ELERA_APPLICATION=sample-app', 'backup-dev', '/workspace/sample-app/app.mjs'], { cwd: process.cwd() });
  return { container: container.trim(), errors, stop: async () => {
    await exec('docker', ['stop', '--time', '10', container.trim()], { cwd: process.cwd() });
    const { stdout, stderr } = await exec('docker', ['logs', container.trim()]);
    const output = `${stdout}${stderr}`;
    for (const line of output.split(/\r?\n/)) if (line.includes('sql.error') || line.includes('routing.error')) errors.push(new Error(line));
    await exec('docker', ['rm', container.trim()], { cwd: process.cwd() });
  } };
}

async function snapshotClients(clients, since = 0) {
  const probes = [];
  const recent = [];
  for (const client of clients) {
    const { stdout, stderr } = await exec('docker', ['logs', client.container]);
    const clientProbes = [];
    for (const line of `${stdout}${stderr}`.split(/\r?\n/)) {
      try { if (line.includes('"event":"sql.probe"')) { const probe = JSON.parse(line); clientProbes.push(probe); if (Date.parse(probe.startedAt) >= since) probes.push(probe); } } catch {}
    }
    recent.push(...clientProbes.slice(-3));
  }
  return probes.length ? probes : recent;
}

function assertTelemetry(probes, phase) {
  const complete = probes.filter((probe) => probe.writeNode && Number.isInteger(Number(probe.generatedId)));
  if (complete.length < 3) throw new Error(`${phase} captured too few complete client probes`);
  const errors = probes.filter((probe) => probe.error || probe.event !== 'sql.probe');
  if (errors.length > 0) throw new Error(`${phase} captured client errors`);
  if (complete.some((probe) => Number(probe.durationMs) > 15000 || Number(probe.gapSincePreviousMs) > 15000)) throw new Error(`${phase} captured excessive client delay`);
  const writers = new Set(complete.map((probe) => probe.writeNode));
  if (writers.size !== 1) throw new Error(`${phase} clients did not converge on one write master: ${[...writers].join(', ')}`);
}

async function assertUnavailable(endpoint) {
  try {
    const response = await fetch(`${endpoint}/readyz`, { signal: AbortSignal.timeout(5000) });
    if (response.ok) throw new Error('stopped node remained ready');
  } catch (error) {
    if (error.message === 'stopped node remained ready') throw error;
  }
}

async function waitForReady(endpoint, attempts = 60) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const response = await fetch(`${endpoint}/readyz`, { signal: AbortSignal.timeout(3000) });
      if (response.ok) return;
    } catch {}
    await delay(1000);
  }
  throw new Error(`${endpoint} did not become ready`);
}

function delay(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }
function readEnv(name) {
  try { return readFileSync('.env', 'utf8').split(/\r?\n/).find((line) => line.startsWith(`${name}=`))?.slice(name.length + 1); } catch { return undefined; }
}
async function post(endpoint, path) {
  const response = await fetch(`${endpoint}${path}`, { method: 'POST', headers: { authorization: `Bearer ${token}` } });
  if (!response.ok) throw new Error(`${path} failed with ${response.status}`);
}
