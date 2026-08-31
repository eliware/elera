import { expect, test } from '@jest/globals';
import { createSupervisorProbes } from '../../src/runtime/probe-wiring.mjs';

test('creates the supervisor probe server from supplied handlers', async () => {
  const server = createSupervisorProbes({ getStatus: async () => ({ ready: false }), controlHandler: async () => {}, upgradeHandler: async () => false, log: { warn: () => {} } });
  expect(server).toEqual(expect.any(Object));
  await new Promise((resolve) => server.close(resolve));
});
