import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = ['compose', '--profile', 'lab'];
const verbose = process.argv.includes('--verbose');
await run([...args, 'down', '--volumes', '--remove-orphans'], { quiet: !verbose });
if (!process.argv.includes('--no-build')) await run([...args, 'build'], { quiet: !verbose });
await run([...args, 'up', '-d', 'elera-single', 'elera-0', 'elera-1', 'elera-2'], { quiet: !verbose });
await new Promise(resolve => setTimeout(resolve, 5000));
await run([...args, 'up', '-d', 'haproxy', 'backup-nas', 'backup-dev'], { quiet: !verbose });
let failed = false;
try { await run(['compose', 'wait', 'backup-dev'], { quiet: !verbose }); } catch { failed = true; }
if (failed) {
  await run([...args, 'ps', '-a'], { quiet: false });
  await printFailureLogs();
  throw new Error('backup-dev failed; see filtered diagnostics above');
}
if (verbose) await run([...args, 'logs', '--no-color'], { quiet: false });
else await printSummary();

function run(command, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn('docker', command, { cwd: root, stdio: options.quiet ? ['ignore', 'pipe', 'pipe'] : 'inherit' });
    let stdout = '';
    child.stdout?.on('data', chunk => { stdout += chunk; });
    child.stderr?.on('data', chunk => { if (!options.quiet) process.stderr.write(chunk); });
    child.once('error', reject);
    child.once('exit', code => code === 0 ? resolve({ stdout }) : reject(new Error(`docker ${command.join(' ')} exited with ${code}`)));
  });
}

async function printFailureLogs() {
  console.error('[e2e] failure diagnostics (warnings/errors only)');
  const result = await run([...args, 'logs', '--no-color'], { quiet: true });
  const lines = result.stdout.split(/\r?\n/).filter(line => /\b(warn|warning|error|failed|failure|crashloop|denied|fatal|exception)\b/i.test(line));
  if (lines.length) process.stderr.write(`${lines.join('\n')}\n`);
  else console.error('[e2e] no warning/error log lines were emitted');
}

async function printSummary() {
  const result = await run([...args, 'logs', '--no-color', '--no-log-prefix', 'backup-dev'], { quiet: true });
  const lines = result.stdout.split(/\r?\n/).filter(line => line.includes('[e2e]'));
  if (lines.length) process.stdout.write(`${lines.join('\n')}\n`);
  console.log('[e2e] complete');
}
