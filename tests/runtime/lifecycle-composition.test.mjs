import { expect, jest, test } from '@jest/globals';
import { createSupervisorLifecycle } from '../../src/runtime/lifecycle-composition.mjs';

test('composes supervisor error and shutdown lifecycle', () => {
  const result = createSupervisorLifecycle({ log: { error: jest.fn(), warn: jest.fn(), debug: jest.fn() }, lifecycle: { get: jest.fn(), set: jest.fn() }, sqlQuiesce: { begin: jest.fn() }, drain: { wait: jest.fn() }, clusterDrain: { set: jest.fn() }, config: {}, identity: { name: 'node-a.example.test' }, observationStore: {}, getTimers: () => [], routingBus: {}, routingStream: {}, telemetry: {}, servers: [], closeServer: jest.fn(), getMariaProcess: () => undefined, getDb: () => undefined });
  expect(result.errors).toBeDefined(); expect(result.shutdown).toEqual(expect.any(Function)); expect(result.signals).toBeDefined();
});
