import { expect, jest, test } from '@jest/globals';
import { verifySupervisorJoin } from '../../src/runtime/join-verification.mjs';

test('ignores non-join startup states', async () => {
  expect(verifySupervisorJoin({ elera: false, mode: 'join', sqlReady: true })).toBe(false);
});

test('records a valid joined Primary member', async () => {
  const recoveryState = { set: jest.fn() };
  const recoveryAudit = { joinComplete: jest.fn(), failure: jest.fn() };
  await expect(verifySupervisorJoin({ elera: true, mode: 'join', sqlReady: true, health: { status: async () => ({ values: { wsrep_local_state_comment: 'Synced', wsrep_ready: 'ON', wsrep_cluster_status: 'Primary', wsrep_cluster_state_uuid: 'cluster', wsrep_cluster_size: '2' } }) }, startupDecision: { epoch: 4, recoveryEpoch: { clusterId: 'cluster' } }, expectedSize: 2, recoveryState, recoveryAudit, node: 'node-a' })).resolves.toBe(true);
  expect(recoveryState.set).toHaveBeenCalled();
  expect(recoveryAudit.joinComplete).toHaveBeenCalled();
});

test('records a valid rejoined Primary member', async () => {
  const recoveryState = { set: jest.fn() };
  const recoveryAudit = { joinComplete: jest.fn(), failure: jest.fn() };
  await expect(verifySupervisorJoin({ elera: true, mode: 'rejoin', sqlReady: true, health: { status: async () => ({ values: { wsrep_local_state_comment: 'Synced', wsrep_ready: 'ON', wsrep_cluster_status: 'Primary', wsrep_cluster_state_uuid: 'cluster', wsrep_cluster_size: '3' } }) }, startupDecision: { epoch: 5, recoveryEpoch: { clusterId: 'cluster' } }, expectedSize: 3, recoveryState, recoveryAudit, node: 'node-a' })).resolves.toBe(true);
  expect(recoveryState.set).toHaveBeenCalledWith('complete', expect.any(Object));
});

test('records a failed joined Primary validation', async () => {
  const recoveryAudit = { joinComplete: jest.fn(), failure: jest.fn() };
  await expect(verifySupervisorJoin({ elera: true, mode: 'join', sqlReady: true, health: { status: async () => ({ values: {} }) }, startupDecision: { epoch: 4 }, expectedSize: 2, recoveryState: { set: jest.fn() }, recoveryAudit, node: 'node-a' })).resolves.toBe(false);
  expect(recoveryAudit.failure).toHaveBeenCalled();
});

test('accepts a joined member before the final cluster size is present', async () => {
  const recoveryState = { set: jest.fn() }; const recoveryAudit = { joinComplete: jest.fn(), failure: jest.fn() };
  await expect(verifySupervisorJoin({ elera: true, mode: 'join', sqlReady: true, health: { status: async () => ({ values: { wsrep_cluster_state_uuid: 'cluster', wsrep_local_state_comment: 'Synced', wsrep_ready: 'ON', wsrep_cluster_status: 'Primary', wsrep_cluster_size: '2' } }) }, startupDecision: { epoch: 4 }, expectedSize: 3, recoveryState, recoveryAudit, node: 'node-a' })).resolves.toBe(true);
});
