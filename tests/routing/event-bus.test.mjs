import { afterEach, expect, test, jest } from '@jest/globals';
import { createRoutingEventBus } from '../../src/routing/event-bus.mjs';

let bus;
afterEach(() => bus?.close());
test('publishes latest events to subscribers and heartbeats clients', () => {
  jest.useFakeTimers();
  bus = createRoutingEventBus({ heartbeatMs: 100, log: { warn: jest.fn() } });
  const send = jest.fn(); const ping = jest.fn(); const remove = bus.subscribe({ send, ping });
  bus.publish({ type: 'x', version: 1 });
  expect(send).toHaveBeenCalledWith({ type: 'x', version: 1 }); expect(bus.latest().version).toBe(1);
  const topology = { type: 'routing.topology', version: 1, generatedAt: '2026-08-30T12:00:00.000Z', node: 'node', context: { nodeIdentity: { name: 'node' }, ports: { sql: 3306, http: 8080 }, clusterCondition: 'Primary' }, topology: { nodes: [] } };
  bus.publish(topology); expect(bus.latest()).toBe(topology);
  jest.advanceTimersByTime(100); expect(ping).toHaveBeenCalled(); remove(); expect(bus.clientCount()).toBe(0); jest.useRealTimers();
});
test('rejects invalid event and clients', () => { bus = createRoutingEventBus(); expect(() => bus.publish()).toThrow(); expect(() => bus.subscribe()).toThrow(); });
test('filters events, handles missing optional callbacks, and exposes empty state', () => { bus = createRoutingEventBus({ log: {} }); const send = jest.fn(); bus.subscribe({ send }, () => false); bus.publish({ type: 'ignored' }); expect(send).not.toHaveBeenCalled(); expect(bus.latest()).toEqual({ type: 'ignored' }); });
test('replays the latest event when a subscriber filter accepts it', () => { bus = createRoutingEventBus(); const send = jest.fn(); bus.publish({ type: 'x' }); bus.subscribe({ send }, () => true); expect(send).toHaveBeenCalledWith({ type: 'x' }); });
test('heartbeats clients that do not expose ping', () => { jest.useFakeTimers(); bus = createRoutingEventBus({ heartbeatMs: 10 }); bus.subscribe({ send: jest.fn() }); jest.advanceTimersByTime(10); expect(bus.clientCount()).toBe(1); jest.useRealTimers(); });
test('executes the heartbeat loop through an injected scheduler', () => { let tick; const clear = jest.fn(); bus = createRoutingEventBus({ setIntervalImpl: (callback) => { tick = callback; return { unref: jest.fn() }; } }); bus.subscribe({ send: jest.fn(), ping: () => { throw new Error('dead'); } }); tick(); expect(bus.clientCount()).toBe(0); bus.close(); expect(clear).not.toHaveBeenCalled(); });
test('replays filtered events and removes clients that fail delivery or heartbeat', () => { jest.useFakeTimers(); const warn = jest.fn(); bus = createRoutingEventBus({ heartbeatMs: 10, log: { warn } }); const first = jest.fn(); bus.subscribe({ send: first }, (event) => event.type === 'x'); const bad = { send: () => { throw new Error('send'); }, ping: () => { throw new Error('ping'); } }; bus.subscribe(bad); bus.publish({ type: 'x' }); expect(first).toHaveBeenCalledTimes(1); expect(bus.clientCount()).toBe(1); jest.advanceTimersByTime(10); expect(bus.clientCount()).toBe(1); expect(warn).toHaveBeenCalled(); jest.useRealTimers(); });
