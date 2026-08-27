import { jest } from '@jest/globals';
import { createGaleraBootstrap, waitForSql } from '../src/lifecycle/startup.mjs';

test('waitForSql retries until health succeeds', async () => {
  const health = { status: jest.fn().mockRejectedValueOnce(new Error('starting')).mockResolvedValueOnce({ ready: true }) };
  expect(await waitForSql({ health, timeoutMs: 1000, delayMs: 1, log: { debug: jest.fn() } })).toBe(true);
  expect(health.status).toHaveBeenCalledTimes(2);
});

test('Galera bootstrap restarts MariaDB with the new-cluster flag', async () => {
  const controller = { stop: jest.fn().mockResolvedValue(), start: jest.fn().mockResolvedValue() };
  const health = { status: jest.fn().mockResolvedValue({ ready: false }) };
  let busy = false;
  const bootstrap = createGaleraBootstrap({ processController: controller, args: ['--wsrep-on=ON'], health, timeoutMs: 10, log: { warn: jest.fn() }, isBusy: () => busy, setBusy: (value) => { busy = value; } });
  await bootstrap();
  expect(controller.start).toHaveBeenCalledWith(['--wsrep-on=ON', '--wsrep-new-cluster']); expect(busy).toBe(false);
});
