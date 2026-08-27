import { expect, jest, test } from '@jest/globals';
import { createDrainManager } from '../src/lifecycle/drain-manager.mjs';
import { createSqlQuiesce } from '../src/lifecycle/sql-quiesce.mjs';

test('drains tracked work and provides a settle window for direct SQL sessions', async () => {
  const drain = createDrainManager();
  const sleep = jest.fn(async () => {});
  const quiesce = createSqlQuiesce({ drain, timeoutMs: 25, sleep });
  await expect(quiesce.begin()).resolves.toEqual({ drained: true, settled: true });
  expect(drain.isDraining()).toBe(true);
  expect(sleep).toHaveBeenCalledWith(25);
});

test('requires a drain manager', () => {
  expect(() => createSqlQuiesce()).toThrow('drain manager is required');
});
