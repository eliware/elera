import { spawn } from 'node:child_process';

export function createMariaDbProcess({ args, log, onUnexpectedExit }) {
  let child; let stopping = false;
  const start = (nextArgs = args) => new Promise((resolve, reject) => {
    stopping = false;
    child = spawn('mariadbd', nextArgs, { stdio: 'inherit' });
    child.once('error', reject);
    child.once('spawn', () => resolve(child));
    child.once('exit', (code, signal) => { log?.error?.('mariadbd exited', { code, signal }); if (!stopping) onUnexpectedExit?.(code, signal); });
  });
  const stop = async (timeoutMs = 5000) => { if (!child || child.exitCode !== null) return; stopping = true; await new Promise((resolve) => { const timer = setTimeout(resolve, timeoutMs); child.once('exit', () => { clearTimeout(timer); resolve(); }); child.kill('SIGTERM'); }); };
  return { start, stop, get child() { return child; }, get stopping() { return stopping; } };
}
