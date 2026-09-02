import { expect, test } from '@jest/globals';
import { createRoutingComposition } from '../../src/runtime/routing-composition.mjs';

test('composes routing stores, bundle service, event snapshot, and bus', () => {
  const config = { clusterSize: 2, intent: { cluster: { members: [{ name: 'node.example.test', address: 'node.example.test' }] } } };
  const result = createRoutingComposition({ environment: { MARIADB_DATA_DIR: '/data' }, config, identity: { name: 'node.example.test' }, observationStore: { snapshot: () => [] }, managed: { lease: async () => ({}) }, query: async () => [[], []], resolveAddress: async () => [], log: {} });
  expect(result.routingEnvironment.ELERA_CLUSTER_SIZE).toBe('2');
  expect(result.routingAssignments).toEqual(expect.any(Object));
  expect(result.sharedRoutingAssignments).toEqual(expect.any(Object));
  expect(result.routingBundles).toEqual(expect.any(Object));
  expect(result.routingEvent).toEqual(expect.any(Function));
  expect(result.routingBus).toEqual(expect.any(Object));
});

test('uses default routing paths and event fallbacks', () => {
  const config = { clusterSize: 1, intent: { cluster: { members: [{ name: 'node.example.test', address: 'node.example.test' }] } } };
  const result = createRoutingComposition({ environment: {}, config, identity: { name: 'node.example.test' }, observationStore: { snapshot: () => [{ nodeId: 'node.example.test', address: 'node.example.test', drain: false, health: 'ok', synced: true, primary: 'Primary' }] }, managed: { lease: async () => ({}) }, query: async () => [[], []], resolveAddress: async () => [], log: {} });
  expect(result.routingEvent()).toEqual(expect.objectContaining({ type: 'routing.topology', version: expect.any(Number), context: expect.any(Object) }));
});
