import { expect, jest, test } from '@jest/globals';
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
  await expect(promise).rejects.toMatchObject({ message: expect.stringContaining('exited with 2'), code: 'WSREP_RECOVERY_POSITION_UNAVAILABLE', exitCode: 2, diagnostic: '' });
});

test('reports bounded diagnostics when recovery emits no position', async () => {
  const child = childProcess();
  const promise = runWsrepRecover('/data', { spawnImpl: () => child });
  child.emitStderr('startup warning\n' + 'x'.repeat(3000));
  child.emit('exit', 1);
  await expect(promise).rejects.toMatchObject({ code: 'WSREP_RECOVERY_POSITION_UNAVAILABLE', diagnostic: expect.stringContaining('x') });
  await expect(promise).rejects.toHaveProperty('diagnostic.length', 2048);
});

test('surfaces spawn failures separately from missing recovery positions', async () => {
  const child = childProcess();
  const promise = runWsrepRecover('/data', { spawnImpl: () => child });
  child.emit('error', Object.assign(new Error('mariadbd unavailable'), { code: 'ENOENT' }));
  await expect(promise).rejects.toMatchObject({ message: 'mariadbd unavailable', code: 'ENOENT' });
});

test('preserves a recovered position when mariadbd exits nonzero after Galera connection failure', async () => {
  const child = childProcess();
  const promise = runWsrepRecover('/data', { spawnImpl: () => child });
  child.emitStderr('WSREP: Recovered position: abcdef-1234:42\nWSREP connection refused');
  child.emit('exit', 1);
  await expect(promise).resolves.toContain('Recovered position: abcdef-1234:42');
});
test('kills and rejects a recovery process that exceeds its timeout', async () => {
  const child = childProcess(); const timers = []; const kill = jest.fn(); child.kill = kill;
  const promise = runWsrepRecover('/data', { spawnImpl: () => child, timeoutMs: 25, setTimer: (callback) => { timers.push(callback); return 1; }, clearTimer: jest.fn() });
  child.emitStderr('partial recovery output'); timers[0]();
  await expect(promise).rejects.toMatchObject({ code: 'WSREP_RECOVERY_TIMEOUT', diagnostic: 'partial recovery output' });
  expect(kill).toHaveBeenCalledWith('SIGKILL');
});
test('ignores late timeout and process events after recovery settles', async () => {
  const child = childProcess(); const timers = []; const clearTimer = jest.fn();
  const promise = runWsrepRecover('/data', { spawnImpl: () => child, setTimer: (callback) => { timers.push(callback); return 1; }, clearTimer });
  child.emit('exit', 0); timers[0](); child.emit('error', new Error('late error'));
  await expect(promise).resolves.toBe(''); expect(clearTimer).toHaveBeenCalledWith(1);
});
