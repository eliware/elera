import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = ['compose', '--profile', 'lab'];
await run([...args, 'down', '--volumes', '--remove-orphans']);
if (!process.argv.includes('--no-build')) await run([...args, 'build']);
await run([...args, 'up', '-d', 'elera-single', 'elera-0', 'elera-1', 'elera-2']);
await new Promise(resolve => setTimeout(resolve, 5000));
await run([...args, 'up', '--abort-on-container-exit', '--exit-code-from', 'backup-dev', 'haproxy', 'backup-nas', 'backup-dev']);

function run(command) { return new Promise((resolve, reject) => { const child = spawn('docker', command, { cwd: root, stdio: 'inherit' }); child.once('error', reject); child.once('exit', code => code === 0 ? resolve() : reject(new Error(`docker ${command.join(' ')} exited with ${code}`))); }); }
