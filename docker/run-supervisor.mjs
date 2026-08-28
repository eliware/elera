import { spawn } from 'node:child_process';

/**
 * Run the supervisor as the container's managed child and forward lifecycle
 * signals so MariaDB receives the supervisor's graceful shutdown sequence.
 */
export function runSupervisor(command, args, { spawnProcess = spawn, signalSource = process } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawnProcess(command, args, { stdio: ['ignore', 'inherit', 'inherit'] });
    let forwarding = false;

    const forward = signal => {
      if (forwarding || child.exitCode !== null) return;
      forwarding = true;
      child.kill(signal);
    };
    const onTerm = () => forward('SIGTERM');
    const onInt = () => forward('SIGINT');
    signalSource.once('SIGTERM', onTerm);
    signalSource.once('SIGINT', onInt);

    const cleanup = () => {
      signalSource.off('SIGTERM', onTerm);
      signalSource.off('SIGINT', onInt);
    };
    child.once('error', error => { cleanup(); reject(error); });
    child.once('exit', (code, signal) => {
      cleanup();
      if (signal) return resolve({ code: 1, signal });
      resolve({ code: code ?? 1, signal: null });
    });
  });
}
