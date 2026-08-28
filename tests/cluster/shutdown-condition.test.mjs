import { expect, test } from '@jest/globals';
import { shutdownCondition } from '../../src/cluster/shutdown-condition.mjs';

const healthy = (nodeId) => ({ nodeId, synced: true, primary: 'Primary', health: 'ok', drain: false });
test('classifies standalone, ordinary cluster, last survivor, and total outage', () => {
  expect(shutdownCondition()).toBe('standalone');
  expect(shutdownCondition({ clusterSize: 3, observations: [healthy('a'), healthy('b')], localNodeId: 'a' })).toBe('cluster-member');
  expect(shutdownCondition({ clusterSize: 3, observations: [healthy('a')], localNodeId: 'a' })).toBe('last-survivor');
  expect(shutdownCondition({ clusterSize: 3, observations: [], localNodeId: 'a' })).toBe('total-cluster-unavailable');
});

test('does not call a peer that is drained or not healthy a survivor', () => {
  expect(shutdownCondition({ clusterSize: 3, observations: [{ ...healthy('b'), drain: true }], localNodeId: 'a' })).toBe('total-cluster-unavailable');
  expect(shutdownCondition({ clusterSize: 3, observations: [{ ...healthy('a'), synced: false }], localNodeId: 'a' })).toBe('total-cluster-unavailable');
});
