import { expect, test } from '@jest/globals';
import { startRuntimeCycles, stopRuntimeCycles } from '../../src/runtime/cycles.mjs';

function timerFactory(timers) { return (callback, interval) => { const timer = { callback, interval, unref: () => { timer.unrefed = true; } }; timers.push(timer); return timer; }; }

test('starts routing and peer cycles at one second and publishes immediately', async () => {
  const timers = [];
  const calls = [];
  const cycles = startRuntimeCycles({ publishRoutingEvent: () => calls.push('routing'), publishPeers: async () => calls.push('peers'), setIntervalImpl: timerFactory(timers) });
  await Promise.resolve();
  await timers[1].callback();
  expect(timers.map(({ interval }) => interval)).toEqual([1000, 1000]);
  expect(calls).toEqual(['routing', 'peers', 'peers']);
  expect(cycles.routingTimer.unrefed).toBe(true);
  expect(cycles.peerTimer.unrefed).toBe(true);
});

test('stops active timers and supports routing-only operation', () => {
  const timers = [];
  const cleared = [];
  const cycles = startRuntimeCycles({ publishRoutingEvent: () => {}, setIntervalImpl: timerFactory(timers) });
  stopRuntimeCycles({ ...cycles, clearIntervalImpl: (timer) => cleared.push(timer) });
  expect(cleared).toEqual([cycles.routingTimer]);
});
