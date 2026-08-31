import { expect, test } from '@jest/globals';
import { createSupervisorCluster } from '../../src/runtime/cluster-wiring.mjs';

test('wires cluster lifecycle status and operations', async () => {
  let started = false;
  let drained = false;
  let lifecycleOptions;
  const lifecycle = createSupervisorCluster({ query: async () => [[], []], health: { status: async () => ({ ready: true }) }, processController: { start: async () => { started = true; } }, clusterDrain: { set: (value) => { drained = value; } }, environment: {}, config: {}, createLifecycleManagerImpl: (options) => { lifecycleOptions = options; return { marker: true }; } });
  expect(lifecycle).toEqual({ marker: true });
  await expect(lifecycleOptions.status()).resolves.toEqual({ ready: true });
  await lifecycleOptions.operations.recover();
  await lifecycleOptions.operations.leave();
  expect(started).toBe(true);
  expect(drained).toBe(true);
});
