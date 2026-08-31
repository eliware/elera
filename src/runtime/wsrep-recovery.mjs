import { spawn } from 'node:child_process';

export function runWsrepRecover(directory, { spawnImpl = spawn } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawnImpl('mariadbd', [`--defaults-extra-file=/run/elera/mariadb.cnf`, `--datadir=${directory}`, '--user=mysql', '--skip-networking', '--wsrep-recover'], { stdio: ['ignore', 'pipe', 'pipe'] });
    let output = '';
    child.stdout.on('data', (value) => { output += value; });
    child.stderr.on('data', (value) => { output += value; });
    child.once('error', reject);
    child.once('exit', (code) => code === 0 ? resolve(output) : reject(new Error(`mariadbd wsrep recovery exited with ${code}`)));
  });
}
