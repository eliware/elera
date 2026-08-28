import { spawn } from 'node:child_process';
import { access } from 'node:fs/promises';
import { startPendingInitRuntime } from '/app/src/lifecycle/pending-init/runtime.mjs';
import { initializePendingData } from '/app/src/lifecycle/pending-init/initialize.mjs';
import { runSupervisor } from './run-supervisor.mjs';

const datadir = process.env.MARIADB_DATA_DIR ?? '/var/lib/mysql';
if (!(await exists(`${datadir}/mysql`))) {
  const entries = await import('node:fs/promises').then(fs => fs.readdir(datadir));
  if (entries.length === 0) { startPendingInitRuntime(); }
  else process.exit(fail('pending initialization requires an empty data directory'));
} else {
  const action = await runNode('/app/src/lifecycle/data-directory-cli.mjs', datadir, 'false');
  if (action === 'initialize') await initialize(datadir);
  if (action === 'fail') process.exit(fail('MariaDB data-directory validation failed'));
  if (action === 'initialize') await import('node:fs/promises').then(fs => fs.writeFile(`${datadir}/.elera-supervisor-initialized`, ''));
  const result = await runSupervisor('node', ['/app/src/main.mjs']);
  if (result.code !== 0) process.exit(result.code);
}

async function initialize(directory) {
  await initializePendingData({ environment: { ...process.env, MARIADB_DATA_DIR: directory }, log: console });
}
async function exists(path) { try { await access(path); return true; } catch { return false; } }
function runNode(file, ...args) { return new Promise((resolve, reject) => { const child = spawn('node', [file, ...args], { stdio: ['ignore', 'pipe', 'inherit'] }); let out = ''; child.stdout.on('data', data => out += data); child.once('error', reject); child.once('exit', code => code === 0 ? resolve(out.trim()) : reject(new Error(`node ${file} exited with ${code}`))); }); }
function runStatus(command, args) { return new Promise(resolve => { const child = spawn(command, args, { stdio: 'ignore' }); child.once('exit', code => resolve(code ?? 1)); child.once('error', () => resolve(1)); }); }
function fail(message) { console.error(message); return 1; }
