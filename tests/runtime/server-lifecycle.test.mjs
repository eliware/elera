import { expect, test } from '@jest/globals';
import { closeServer } from '../../src/runtime/server-lifecycle.mjs';

test('closes a listening server and waits for completion', async () => {
  let closed = false;
  await closeServer({ listening: true, close(callback) { callback(); closed = true; } });
  expect(closed).toBe(true);
});

test('does not close a server that is not listening', async () => {
  let called = false;
  await closeServer({ listening: false, close() { called = true; } });
  expect(called).toBe(false);
});

test('accepts an absent server during partial startup cleanup', async () => {
  await expect(closeServer()).resolves.toBeUndefined();
});
