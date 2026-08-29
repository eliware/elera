import { jest } from '@jest/globals';
import { createEleraBootstrap, waitForSql } from '../../src/lifecycle/startup.mjs';

test('waitForSql retries until health succeeds', async () => {
  const health = { status: jest.fn().mockRejectedValueOnce(new Error('starting')).mockResolvedValueOnce({ ready: true }) };
  expect(await waitForSql({ health, timeoutMs: 1000, delayMs: 1, log: { debug: jest.fn() } })).toBe(true);
  expect(health.status).toHaveBeenCalledTimes(2);
});
test('waitForSql returns false after its timeout and tolerates absent debug logging', async () => { const health = { status: jest.fn().mockRejectedValue(new Error('down')) }; expect(await waitForSql({ health, timeoutMs: 2, delayMs: 1 })).toBe(false); });

test('Elera bootstrap restarts MariaDB with the new-cluster flag', async () => {
  const controller = { stop: jest.fn().mockResolvedValue(), start: jest.fn().mockResolvedValue() };
  const health = { status: jest.fn().mockResolvedValue({ ready: false }) };
  let busy = false;
  const bootstrap = createEleraBootstrap({ processController: controller, args: ['--wsrep-on=ON'], health, timeoutMs: 10, log: { warn: jest.fn() }, isBusy: () => busy, setBusy: (value) => { busy = value; } });
  await bootstrap();
  expect(controller.start).toHaveBeenCalledWith(['--wsrep-on=ON', '--wsrep-new-cluster']); expect(busy).toBe(false);
});
test('bootstrap refuses busy or ready nodes and clears busy after failure', async () => {
  const controller = { stop: jest.fn().mockRejectedValue(new Error('stop failed')), start: jest.fn() };
  const busy = createEleraBootstrap({ processController: controller, args: [], health: { status: jest.fn().mockResolvedValue({ ready: false }) }, timeoutMs: 1, log: { warn: jest.fn() }, isBusy: () => true, setBusy: jest.fn() });
  await expect(busy()).rejects.toMatchObject({ statusCode: 409 });
  const ready = createEleraBootstrap({ processController: controller, args: [], health: { status: jest.fn().mockResolvedValue({ ready: true }) }, timeoutMs: 1, log: { warn: jest.fn() }, isBusy: () => false, setBusy: jest.fn() });
  await expect(ready()).rejects.toMatchObject({ statusCode: 409 });
  let state; const failing = createEleraBootstrap({ processController: controller, args: [], health: { status: jest.fn().mockResolvedValue({ ready: false }) }, timeoutMs: 1, log: { warn: jest.fn() }, isBusy: () => false, setBusy: (value) => { state = value; } });
  await expect(failing()).rejects.toThrow('stop failed'); expect(state).toBe(false);
});
test('bootstrap treats health probe errors as not ready and removes duplicate bootstrap flags', async () => { const controller = { stop: jest.fn().mockResolvedValue(), start: jest.fn().mockResolvedValue() }; const bootstrap = createEleraBootstrap({ processController: controller, args: ['--wsrep-new-cluster', '--wsrep-on=ON'], health: { status: jest.fn().mockRejectedValue(new Error('starting')) }, timeoutMs: 1, log: { warn: jest.fn() }, isBusy: () => false, setBusy: jest.fn() }); await bootstrap(); expect(controller.start).toHaveBeenCalledWith(['--wsrep-on=ON', '--wsrep-new-cluster']); });
test('bootstrap refuses initialized persistent data', async () => { const controller = { stop: jest.fn(), start: jest.fn() }; const bootstrap = createEleraBootstrap({ processController: controller, args: [], dataDir: '/data', pathExists: () => true, health: { status: jest.fn().mockResolvedValue({ ready: false }) }, timeoutMs: 1, log: { warn: jest.fn() }, isBusy: () => false, setBusy: jest.fn() }); await expect(bootstrap()).rejects.toMatchObject({ statusCode: 409 }); expect(controller.stop).not.toHaveBeenCalled(); });
