import { expect, test } from '@jest/globals';
import { loadStartupIntent } from '../../src/runtime/startup-intent.mjs';

test('prefers persisted startup intent', async () => {
  const persisted = { source: 'persisted' };
  const result = await loadStartupIntent({ intentState: { read: async () => persisted }, loadEnvironmentIntent: () => { throw new Error('unexpected'); }, node: { name: 'n', address: 'a' } });
  expect(result).toBe(persisted);
});

test('loads environment intent with runtime identity fallback', async () => {
  let received;
  const result = await loadStartupIntent({ intentState: { read: async () => undefined }, loadEnvironmentIntent: (value) => { received = value; return { source: 'environment' }; }, node: { name: 'n', address: 'a' } });
  expect(received).toEqual({ RUNTIME_NODE_NAME: 'n', RUNTIME_NODE_ADDRESS: 'a' });
  expect(result).toEqual({ source: 'environment' });
});
