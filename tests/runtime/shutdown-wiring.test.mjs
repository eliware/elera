import { expect, jest, test } from '@jest/globals';
import { createSupervisorShutdown } from '../../src/runtime/shutdown-wiring.mjs';

test('wires shutdown dependencies and signal hook', () => {
  let shutdownOptions;
  let signalOptions;
  let drained = false;
  const writeMarker = jest.fn();
  const shutdown = () => {};
  const result = createSupervisorShutdown({ lifecycle: {}, sqlQuiesce: {}, drain: {}, clusterDrain: { set: (value) => { drained = value; } }, config: { clusterSize: 3, shutdownTimeoutMs: 4 }, identity: { name: 'node' }, observationStore: { snapshot: () => [] }, routingBus: {}, routingStream: {}, telemetry: {}, servers: [], closeServer: () => {}, getMariaProcess: () => {}, getDb: () => {}, getTimers: () => [], errors: {}, log: {}, restartMarker: { write: writeMarker }, createShutdownImpl: (options) => { shutdownOptions = options; return shutdown; }, registerSignalsImpl: (options) => { signalOptions = options; return 'signals'; } });
  expect(result).toEqual({ shutdown, signals: 'signals' });
  expect(signalOptions.shutdownHook).toBe(shutdown);
  expect(shutdownOptions.getTimers()).toEqual([]);
  expect(shutdownOptions.shutdownCondition()).toBe('total-cluster-unavailable');
  shutdownOptions.propagateDrain();
  expect(drained).toBe(true);
  shutdownOptions.beforeMariaStop();
  expect(writeMarker).toHaveBeenCalled();
});
