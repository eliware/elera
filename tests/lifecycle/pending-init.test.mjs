import { expect, test } from '@jest/globals';
import { createPendingInitServer, initializePendingData, createClusterHandoff, startPendingInitRuntime } from '../../src/lifecycle/pending-init.mjs';

test('exports the pending-init public barrel contract', () => {
  expect(createPendingInitServer).toBeDefined();
  expect(initializePendingData).toBeDefined();
  expect(createClusterHandoff).toBeDefined();
  expect(startPendingInitRuntime).toBeDefined();
});
