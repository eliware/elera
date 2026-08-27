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
  const stop = async (timeoutMs = 5000) => {
    if (!child) return { stopped: true, forced: false };
    if (child.exitCode !== null) return { stopped: true, forced: false };
    stopping = true;
    return new Promise((resolve) => {
      let settled = false;
      const onExit = () => finish(false);
      const finish = (forced) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        queueMicrotask(() => child.removeListener('exit', onExit));
        resolve({ stopped: child.exitCode !== null, forced });
      };
      const timer = setTimeout(() => { child.kill('SIGKILL'); finish(true); }, timeoutMs);
      child.on('exit', onExit);
      child.kill('SIGTERM');
    });
  };
  return { start, stop, get child() { return child; }, get stopping() { return stopping; } };
}
