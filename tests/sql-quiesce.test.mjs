import { expect, jest, test } from '@jest/globals';
import { createDrainManager } from '../src/lifecycle/drain-manager.mjs';
import { createSqlQuiesce } from '../src/lifecycle/sql-quiesce.mjs';

test('drains tracked work and provides a settle window for direct SQL sessions', async () => {
  const drain = createDrainManager();
  const quiesce = createSqlQuiesce({ drain, timeoutMs: 25 });
  await expect(quiesce.begin()).resolves.toEqual({ drained: true, settled: true });
  expect(drain.isDraining()).toBe(true);
});

test('requires a drain manager', () => {
  expect(() => createSqlQuiesce()).toThrow('drain manager is required');
});

test('uses the default settle timer', async () => {
  const drain = createDrainManager();
  await expect(createSqlQuiesce({ drain, timeoutMs: 0 }).begin()).resolves.toEqual({ drained: true, settled: true });
});

test('allows shutdown to supply a bounded quiesce deadline', async () => {
  const wait = jest.fn(async () => true);
  const quiesce = createSqlQuiesce({ drain: { begin: jest.fn(), wait } });
  await quiesce.begin(17);
  expect(wait).toHaveBeenCalledWith(17);
});
