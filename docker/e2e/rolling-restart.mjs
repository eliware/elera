import { execFile } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { promisify } from 'node:util';

const exec = promisify(execFile);
const token = process.env.ROOT_TOKEN ?? readEnv('ROOT_TOKEN') ?? 'root_token_here';
const node = 'http://127.0.0.1:8081';
const peers = ['http://127.0.0.1:8082', 'http://127.0.0.1:8083'];

await post(node, '/api/v1/traffic/undrain');
await waitForReady(node);
await Promise.all(peers.map((peer) => waitForReady(peer)));
await assertRoute(node);
const client = await startClient();
await delay(5000);
console.log('[rolling-e2e] baseline cluster healthy');

await exec('docker', ['compose', 'stop', '--timeout', '60', 'elera-0'], { cwd: process.cwd() });
await Promise.all(peers.map((peer) => waitForReady(peer)));
await assertUnavailable(node);
console.log('[rolling-e2e] drained node excluded while stopped');

await exec('docker', ['compose', 'start', 'elera-0'], { cwd: process.cwd() });
await waitForReady(node, 120);
await Promise.all(peers.map((peer) => waitForReady(peer)));
await assertRoute(node);
await delay(5000);
await client.stop();
if (client.errors.length > 0) throw new Error(`sample client recorded ${client.errors.length} query errors`);
console.log('[rolling-e2e] restarted node returned to healthy routing');

async function assertRoute(endpoint) {
  const response = await fetch(`${endpoint}/api/v1/routing/bundle?identity=sample-runtime`, { headers: { authorization: `Bearer ${token}` } });
  if (!response.ok) throw new Error(`routing bundle failed with ${response.status}`);
}

async function startClient() {
  const errors = [];
  const { stdout: container } = await exec('docker', ['compose', 'run', '--detach', '--name', 'elera-rolling-client', '--no-deps', '-e', 'ELERA_API_ENDPOINT=http://haproxy:8080', `-e=ELERA_API_TOKEN=${token}`, '-e', 'ELERA_IDENTITY=sample-runtime', '-e', 'ELERA_APPLICATION=sample-app', 'backup-dev', 'node', '/workspace/sample-app/app.mjs'], { cwd: process.cwd() });
  return { errors, stop: async () => {
    await exec('docker', ['stop', '--time', '10', container.trim()], { cwd: process.cwd() });
    const { stdout, stderr } = await exec('docker', ['logs', container.trim()]);
    const output = `${stdout}${stderr}`;
    for (const line of output.split(/\r?\n/)) if (line.includes('sql.error') || line.includes('routing.error')) errors.push(new Error(line));
    await exec('docker', ['rm', container.trim()], { cwd: process.cwd() });
  } };
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
