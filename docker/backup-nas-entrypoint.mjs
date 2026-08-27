import { mkdir, access, copyFile, chmod } from 'node:fs/promises';
import { spawn } from 'node:child_process';

await mkdir('/run/sshd', { recursive: true });
await mkdir('/root/.ssh', { recursive: true });
await mkdir('/srv/backups', { recursive: true });
await run('ssh-keygen', ['-A']);
while (true) { try { await access('/lab/exchange/dev_authorized_key'); break; } catch { await new Promise(resolve => setTimeout(resolve, 1000)); } }
await copyFile('/lab/exchange/dev_authorized_key', '/root/.ssh/authorized_keys');
await chmod('/root/.ssh', 0o700); await chmod('/root/.ssh/authorized_keys', 0o600);
await run('/usr/sbin/sshd', ['-D', '-e']);

function run(command, args) { return new Promise((resolve, reject) => { const child = spawn(command, args, { stdio: 'inherit' }); child.once('error', reject); child.once('exit', (code, signal) => signal ? reject(new Error(`${command} stopped by ${signal}`)) : resolve(code)); }); }
