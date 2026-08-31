import { spawn } from 'node:child_process';

export function runWsrepRecover(directory, { spawnImpl = spawn, timeoutMs = 30000, setTimer = setTimeout, clearTimer = clearTimeout } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawnImpl('mariadbd', [`--defaults-extra-file=/run/elera/mariadb.cnf`, `--datadir=${directory}`, '--user=mysql', '--skip-networking', '--wsrep-recover'], { stdio: ['ignore', 'pipe', 'pipe'] });
    let output = '';
    let settled = false;
    const timer = setTimer(() => {
      if (settled) return;
      settled = true;
      child.kill?.('SIGKILL');
      reject(Object.assign(new Error(`mariadbd wsrep recovery timed out after ${timeoutMs}ms`), { code: 'WSREP_RECOVERY_TIMEOUT', diagnostic: output.trim().slice(-2048) }));
    }, timeoutMs);
    const finish = (callback) => (...args) => { if (settled) return; settled = true; clearTimer(timer); callback(...args); };
    child.stdout.on('data', (value) => { output += value; });
    child.stderr.on('data', (value) => { output += value; });
    child.once('error', finish(reject));
    child.once('exit', finish((code) => {
      if (code === 0 || /Recovered position:\s*[0-9a-f-]+:-?\d+/i.test(output)) resolve(output);
      else {
        const error = Object.assign(new Error(`mariadbd wsrep recovery exited with ${code}; no recovered position was emitted`), {
          code: 'WSREP_RECOVERY_POSITION_UNAVAILABLE',
          exitCode: code,
          diagnostic: output.trim().slice(-2048)
        });
        reject(error);
      }
    }));
  });
}
