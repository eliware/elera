import { mkdir, access, copyFile, chmod } from 'node:fs/promises';
import { spawn } from 'node:child_process';

await mkdir('/lab/ssh', { recursive: true });
await mkdir('/lab/exchange', { recursive: true });
await mkdir('/lab/backups', { recursive: true });
try { await access('/lab/ssh/id_ed25519'); } catch { await run('ssh-keygen', ['-q', '-t', 'ed25519', '-N', '', '-f', '/lab/ssh/id_ed25519']); }
await copyFile('/lab/ssh/id_ed25519.pub', '/lab/exchange/dev_authorized_key');
await chmod('/lab/ssh/id_ed25519', 0o600);
if (process.argv[2] === 'e2e') process.exit(await run('node', ['/workspace/backup-dev-e2e.mjs']));
await run('tail', ['-f', '/dev/null']);

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: 'inherit' });
    child.once('error', reject); child.once('exit', (code, signal) => signal ? reject(new Error(`${command} stopped by ${signal}`)) : resolve(code ?? 1));
  });
}
