import { expect, test } from '@jest/globals';
import { runWsrepRecover } from '../../src/runtime/wsrep-recovery.mjs';

function childProcess() {
  const listeners = {};
  return {
    stdout: { on: (event, callback) => { listeners.stdout = callback; } },
    stderr: { on: (event, callback) => { listeners.stderr = callback; } },
    once: (event, callback) => { listeners[event] = callback; },
    emit(event, value) { listeners[event]?.(value); },
    emitStdout(value) { listeners.stdout?.(value); },
    emitStderr(value) { listeners.stderr?.(value); },
  };
}

test('runs wsrep recovery with the protected local arguments', async () => {
  const child = childProcess();
  const calls = [];
  const promise = runWsrepRecover('/var/lib/mysql', { spawnImpl: (...args) => { calls.push(args); return child; } });
  child.emitStdout('Recovered position: 1');
  child.emitStderr('');
  child.emit('exit', 0);
  await expect(promise).resolves.toContain('Recovered position: 1');
  expect(calls[0]).toEqual(['mariadbd', expect.arrayContaining(['--wsrep-recover', '--datadir=/var/lib/mysql']), expect.any(Object)]);
});

test('rejects failed recovery', async () => {
  const child = childProcess();
  const promise = runWsrepRecover('/data', { spawnImpl: () => child });
  child.emit('exit', 2);
  await expect(promise).rejects.toThrow('exited with 2');
});
