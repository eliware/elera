import { expect, jest, test } from '@jest/globals';
import { startSupervisorCycles } from '../../src/runtime/cycle-wiring.mjs';

test('starts routing-only cycles without peers', () => {
  const startCycles = jest.fn(() => ({ routingTimer: 'routing' }));
  expect(startSupervisorCycles({ peers: '', publishRoutingEvent: jest.fn(), startCycles })).toEqual({ routingTimer: 'routing' });
  expect(startCycles).toHaveBeenCalledWith({ publishRoutingEvent: expect.any(Function) });
});

test('wires peer observation publishing when peers exist', () => {
  const startCycles = jest.fn((options) => ({ routingTimer: options.publishRoutingEvent, peerTimer: options.publishPeers }));
  const createPeerClient = jest.fn(() => ({ observe: jest.fn() }));
  const createPublisher = jest.fn(() => jest.fn());
  const result = startSupervisorCycles({ peers: 'peer-a,peer-b', token: 'token', store: {}, health: {}, node: 'node-a', clusterId: 'cluster', getDrained: () => false, publishRoutingEvent: jest.fn(), log: {}, startCycles, createPeerClient, createPublisher });
  expect(createPeerClient).toHaveBeenCalledWith({ peers: ['peer-a', 'peer-b'], token: 'token', store: {}, log: {} });
  expect(createPublisher).toHaveBeenCalledWith(expect.objectContaining({ observationStore: {}, clusterId: 'cluster', node: { name: 'node-a', address: expect.any(Function) } }));
  expect(result.peerTimer).toEqual(expect.any(Function));
});
