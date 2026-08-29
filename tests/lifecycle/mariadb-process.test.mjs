import { EventEmitter } from 'node:events';
import { expect, jest, test } from '@jest/globals';

const child = new EventEmitter(); child.exitCode = null; child.kill = jest.fn(() => { child.exitCode = 0; queueMicrotask(() => child.emit('exit', 0, 'SIGTERM')); });
const spawn = jest.fn(() => { queueMicrotask(() => child.emit('spawn')); return child; });
jest.unstable_mockModule('node:child_process', () => ({ spawn }));
const { createMariaDbProcess } = await import('../../src/lifecycle/mariadb-process.mjs');

test('stopping before start is a no-op', async () => { const process = createMariaDbProcess({ args: [], log: { error: jest.fn() } }); await expect(process.stop(1)).resolves.toEqual({ stopped: true, forced: false }); });
test('stopping an already exited child is a no-op', async () => { child.exitCode = null; const process = createMariaDbProcess({ args: [], log: { error: jest.fn() } }); await process.start(); child.exitCode = 0; await expect(process.stop(1)).resolves.toEqual({ stopped: true, forced: false }); child.exitCode = null; });
test('does not signal a process that exits during startup', async () => {
  const exited = new EventEmitter(); exited.exitCode = 1; exited.kill = jest.fn();
  spawn.mockImplementationOnce(() => { queueMicrotask(() => exited.emit('spawn')); return exited; });
  const process = createMariaDbProcess({ args: [], log: { error: jest.fn() } });
  await process.start();
  await expect(process.stop(1)).resolves.toEqual({ stopped: true, forced: false });
  expect(exited.kill).not.toHaveBeenCalled();
});

test('MariaDB process starts and stops idempotently', async () => { const process = createMariaDbProcess({ args: [], log: { error: jest.fn() } }); await process.start(); expect(process.child).toBe(child); expect(process.stopping).toBe(false); await process.stop(100); expect(process.stopping).toBe(true); await process.stop(100); expect(spawn).toHaveBeenCalledTimes(3); expect(child.kill).toHaveBeenCalledWith('SIGTERM'); });
test('reports an unexpected child exit', async () => { child.exitCode = null; const onUnexpectedExit = jest.fn(); const process = createMariaDbProcess({ args: [], log: { error: jest.fn() }, onUnexpectedExit }); await process.start(); child.emit('exit', 1, null); expect(onUnexpectedExit).toHaveBeenCalledWith(1, null); });
test('escalates to SIGKILL when MariaDB exceeds its shutdown timeout', async () => { child.exitCode = null; child.kill.mockImplementation(() => {}); const managed = createMariaDbProcess({ args: [], log: { error: jest.fn() } }); await managed.start(); await expect(managed.stop(1)).resolves.toMatchObject({ stopped: false, forced: true }); expect(child.kill).toHaveBeenLastCalledWith('SIGKILL'); });
test('ignores duplicate process-exit completion', async () => {
  child.exitCode = null;
  child.kill.mockImplementation(() => { child.exitCode = 0; queueMicrotask(() => { child.emit('exit', 0, 'SIGTERM'); child.emit('exit', 0, 'SIGTERM'); }); });
  const managed = createMariaDbProcess({ args: [], log: { error: jest.fn() } });
  await managed.start();
  await expect(managed.stop(10)).resolves.toEqual({ stopped: true, forced: false });
});
