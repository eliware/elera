import { EventEmitter } from 'node:events';
import { expect, jest, test } from '@jest/globals';

const child = new EventEmitter(); child.exitCode = null; child.kill = jest.fn(() => { child.exitCode = 0; queueMicrotask(() => child.emit('exit', 0, 'SIGTERM')); });
const spawn = jest.fn(() => { queueMicrotask(() => child.emit('spawn')); return child; });
jest.unstable_mockModule('node:child_process', () => ({ spawn }));
const { createMariaDbProcess } = await import('../src/lifecycle/mariadb-process.mjs');

test('MariaDB process starts and stops idempotently', async () => { const process = createMariaDbProcess({ args: [], log: { error: jest.fn() } }); await process.start(); expect(process.child).toBe(child); expect(process.stopping).toBe(false); await process.stop(100); expect(process.stopping).toBe(true); await process.stop(100); expect(spawn).toHaveBeenCalledTimes(1); expect(child.kill).toHaveBeenCalledWith('SIGTERM'); });
test('reports an unexpected child exit', async () => { child.exitCode = null; const onUnexpectedExit = jest.fn(); const process = createMariaDbProcess({ args: [], log: { error: jest.fn() }, onUnexpectedExit }); await process.start(); child.emit('exit', 1, null); expect(onUnexpectedExit).toHaveBeenCalledWith(1, null); });
