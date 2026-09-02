import { test, expect, jest } from '@jest/globals';
import { createDrainEventPublisher } from '../../src/lifecycle/drain-events.mjs';

test('rejects incomplete event dependencies', () => {
  expect(() => createDrainEventPublisher()).toThrow('drain event dependencies');
});

test('publishes drain immediately and recovery only after readiness', async () => {
  const publish = jest.fn(); let ready = false;
  const emit = createDrainEventPublisher({ bus: { publish }, node: 'elera-0.example.test', getReady: async () => ({ ready }), now: () => 1 });
  await emit(true); await emit(false);
  expect(publish).toHaveBeenCalledTimes(1);
  ready = true; await emit(false);
  expect(publish.mock.calls[1][0].type).toBe('routing.recovery');
});

test('includes reconnect context in drain and recovery events', async () => {
  const publish = jest.fn();
  const emit = createDrainEventPublisher({ bus: { publish }, node: 'elera-0.example.test', getReady: async () => ({ ready: true }), getContext: () => ({ nodeIdentity: { name: 'elera-0.example.test' }, reconnectDeadlineMs: 60000, loadBalancerEndpoint: 'http://elera' }), now: () => 1 });
  await emit(true); await emit(false);
  expect(publish.mock.calls[0][0]).toMatchObject({ type: 'routing.drain', context: { nodeIdentity: { name: 'elera-0.example.test' }, reconnectDeadlineMs: 60000 } });
  expect(publish.mock.calls[1][0]).toMatchObject({ type: 'routing.recovery', context: { loadBalancerEndpoint: 'http://elera' } });
});

test('withholds recovery when readiness check fails', async () => {
  const publish = jest.fn(); const warn = jest.fn();
  const emit = createDrainEventPublisher({ bus: { publish }, node: 'elera-0.example.test', getReady: async () => { throw new Error('db unavailable'); }, log: { warn } });
  await emit(false);
  expect(publish).not.toHaveBeenCalled(); expect(warn).toHaveBeenCalled();
});
