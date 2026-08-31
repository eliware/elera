import { spawn } from 'node:child_process';

export function runWsrepRecover(directory, { spawnImpl = spawn } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawnImpl('mariadbd', [`--defaults-extra-file=/run/elera/mariadb.cnf`, `--datadir=${directory}`, '--user=mysql', '--skip-networking', '--wsrep-recover'], { stdio: ['ignore', 'pipe', 'pipe'] });
    let output = '';
    child.stdout.on('data', (value) => { output += value; });
    child.stderr.on('data', (value) => { output += value; });
    child.once('error', reject);
    child.once('exit', (code) => {
      if (code === 0 || /Recovered position:\s*[0-9a-f-]+:-?\d+/i.test(output)) resolve(output);
      else {
        const error = Object.assign(new Error(`mariadbd wsrep recovery exited with ${code}; no recovered position was emitted`), {
          code: 'WSREP_RECOVERY_POSITION_UNAVAILABLE',
          exitCode: code,
          diagnostic: output.trim().slice(-2048)
        });
        reject(error);
      }
    });
  });
}
