import { afterEach, expect, test, jest } from '@jest/globals';
import { createRoutingEventBus } from '../src/routing/event-bus.mjs';

let bus;
afterEach(() => bus?.close());
test('publishes latest events to subscribers and heartbeats clients', () => {
  jest.useFakeTimers();
  bus = createRoutingEventBus({ heartbeatMs: 100, log: { warn: jest.fn() } });
  const send = jest.fn(); const ping = jest.fn(); const remove = bus.subscribe({ send, ping });
  bus.publish({ type: 'routing.update', version: 1 });
  expect(send).toHaveBeenCalledWith({ type: 'routing.update', version: 1 }); expect(bus.latest().version).toBe(1);
  jest.advanceTimersByTime(100); expect(ping).toHaveBeenCalled(); remove(); expect(bus.clientCount()).toBe(0); jest.useRealTimers();
});
test('rejects invalid event and clients', () => { bus = createRoutingEventBus(); expect(() => bus.publish()).toThrow(); expect(() => bus.subscribe()).toThrow(); });
