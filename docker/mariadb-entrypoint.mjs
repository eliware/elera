import { spawn } from 'node:child_process';
import { access } from 'node:fs/promises';
import { startPendingInitRuntime } from '/app/src/lifecycle/pending-init/runtime.mjs';

const datadir = process.env.MARIADB_DATA_DIR ?? '/var/lib/mysql';
if (process.env.ELERA_PENDING_INIT === 'true' && !(await exists(`${datadir}/mysql`))) {
  const entries = await import('node:fs/promises').then(fs => fs.readdir(datadir));
  if (entries.length === 0) { startPendingInitRuntime(); }
  else process.exit(fail('pending initialization requires an empty data directory'));
} else {
  const action = await runNode('/app/src/lifecycle/data-directory-cli.mjs', datadir, process.env.ELERA_BOOTSTRAP ?? 'false');
  if (action === 'initialize') await initialize(datadir);
  if (action === 'fail') process.exit(fail('MariaDB data-directory validation failed'));
  if (action === 'initialize') await import('node:fs/promises').then(fs => fs.writeFile(`${datadir}/.elera-supervisor-initialized`, ''));
  await run('node', ['/app/src/main.mjs']);
}

async function initialize(directory) {
  if (!process.env.MARIADB_ROOT_PASSWORD) process.exit(fail('MARIADB_ROOT_PASSWORD is required for explicit initialization'));
  await run('mariadb-install-db', ['--user=mysql', `--datadir=${directory}`, '--skip-test-db', '--auth-root-authentication-method=normal']);
  const socket = '/run/mysqld/init.sock'; const server = spawn('mariadbd', [`--datadir=${directory}`, '--user=mysql', '--skip-networking', `--socket=${socket}`]);
  try { for (let i = 0; i < 60; i++) { if ((await runStatus('mariadb-admin', [`--socket=${socket}`, 'ping', '--silent'])) === 0) break; await new Promise(resolve => setTimeout(resolve, 1000)); if (i === 59) throw new Error('timed out waiting for MariaDB initialization'); }
    const sql = `ALTER USER 'root'@'localhost' IDENTIFIED BY '${process.env.MARIADB_ROOT_PASSWORD}';\nFLUSH PRIVILEGES;\n`;
    await runInput('mariadb', [`--socket=${socket}`, '-uroot'], sql);
  } finally { server.kill('SIGTERM'); }
}
async function exists(path) { try { await access(path); return true; } catch { return false; } }
function runNode(file, ...args) { return new Promise((resolve, reject) => { const child = spawn('node', [file, ...args], { stdio: ['ignore', 'pipe', 'inherit'] }); let out = ''; child.stdout.on('data', data => out += data); child.once('error', reject); child.once('exit', code => code === 0 ? resolve(out.trim()) : reject(new Error(`node ${file} exited with ${code}`))); }); }
function run(command, args) { return runInput(command, args, undefined); }
function runStatus(command, args) { return new Promise(resolve => { const child = spawn(command, args, { stdio: 'ignore' }); child.once('exit', code => resolve(code ?? 1)); child.once('error', () => resolve(1)); }); }
function runInput(command, args, input) { return new Promise((resolve, reject) => { const child = spawn(command, args, { stdio: ['pipe', 'inherit', 'inherit'] }); if (input) child.stdin.end(input); else child.stdin.end(); child.once('error', reject); child.once('exit', code => code === 0 ? resolve() : reject(new Error(`${command} exited with ${code}`))); }); }
function fail(message) { console.error(message); return 1; }
