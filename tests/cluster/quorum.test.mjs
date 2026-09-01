import { expect, test } from '@jest/globals';
import { evaluateQuorum } from '../../src/cluster/quorum.mjs';

const observation = (nodeId, overrides = {}) => ({ nodeId: `${nodeId}.example.test`, clusterId: 'cluster', state: 'Synced', synced: true, primary: 'Primary', health: 'ready', observedAt: 1000, ...overrides });
test('establishes quorum for fresh consistent observations', () => {
  expect(evaluateQuorum([observation('a'), observation('b'), observation('c')], { now: 1000 })).toMatchObject({ quorum: true, required: 2, reason: 'quorum-established', clusterId: 'cluster', primary: 'Primary' });
});
test('rejects stale, conflicting, and insufficient observations', () => {
  expect(evaluateQuorum([observation('a'), observation('b', { observedAt: 0 })], { now: 1000, maxAgeMs: 10, expectedSize: 3 }).reason).toBe('insufficient-fresh-observations');
  expect(evaluateQuorum([observation('a'), observation('b', { clusterId: 'other' })], { now: 1000 }).reason).toBe('conflicting-clusters');
  expect(evaluateQuorum([observation('a'), observation('b', { primary: 'Non-Primary' })], { now: 1000 }).reason).toBe('conflicting-primaries');
});
test('handles empty observations and explicit quorum sizing', () => {
  expect(evaluateQuorum([], { expectedSize: 0 })).toMatchObject({ quorum: false, required: 1, reason: 'insufficient-fresh-observations', clusterId: null, primary: null });
  expect(evaluateQuorum([observation('a')], { now: 1000, expectedSize: 1 })).toMatchObject({ quorum: true, required: 1 });
});
test('does not count duplicate identities or invalid observations toward quorum', () => {
  expect(evaluateQuorum([observation('a'), observation('a'), observation('b')], { now: 1000, expectedSize: 5 }).reason).toBe('insufficient-fresh-observations');
  expect(evaluateQuorum([observation('a'), { nodeId: 'short', observedAt: 1000 }], { now: 1000, expectedSize: 3 }).reason).toBe('invalid-observations');
  expect(evaluateQuorum(null, { expectedSize: 3 }).reason).toBe('insufficient-fresh-observations');
});
