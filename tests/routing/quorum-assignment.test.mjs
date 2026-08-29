import { expect, jest, test } from '@jest/globals';
import { createQuorumAssignmentCoordinator } from '../../src/routing/quorum-assignment.mjs';

const healthy = (overrides = {}) => ({ nodeId: 'n', clusterId: 'c', state: 'Synced', synced: true, primary: 'Primary', health: 'ok', address: 'node', observedAt: 100, ...overrides });
const context = (observations = [healthy()]) => ({ assignmentStore: { get: jest.fn(async () => undefined), set: jest.fn(async (_application, writer) => writer) }, observationStore: { snapshot: () => observations }, environment: { ELERA_CLUSTER_SIZE: '1' }, now: () => 100 });

test('persists assignments only while quorum and target eligibility hold', async () => {
  const value = context(); const coordinator = createQuorumAssignmentCoordinator(value);
  await expect(coordinator.write('payments', 'node')).resolves.toBe('node');
  expect(value.assignmentStore.set).toHaveBeenCalledWith('payments', 'node');
});

test('refuses assignment without quorum or to an ineligible target', async () => {
  await expect(createQuorumAssignmentCoordinator({ ...context(), environment: { ELERA_CLUSTER_SIZE: '3' } }).write('app', 'node')).rejects.toMatchObject({ code: 'QUORUM_REQUIRED' });
  await expect(createQuorumAssignmentCoordinator(context([healthy({ synced: false })])).write('app', 'node')).rejects.toMatchObject({ code: 'WRITER_INELIGIBLE' });
  await expect(createQuorumAssignmentCoordinator(context([healthy({ drain: true })])).write('app', 'node')).rejects.toMatchObject({ code: 'WRITER_INELIGIBLE' });
});

test('requires assignment dependencies and reports persistence errors', async () => {
  expect(() => createQuorumAssignmentCoordinator()).toThrow('dependencies');
  const value = context(); value.assignmentStore.set.mockRejectedValue(new Error('storage')); const coordinator = createQuorumAssignmentCoordinator({ ...value, log: { error: jest.fn() } });
  await expect(coordinator.write('app', 'node')).rejects.toThrow('storage');
  expect(await coordinator.read('app')).toBeUndefined();
});

test('rethrows persistence errors when no error logger is configured', async () => {
  const value = context();
  value.assignmentStore.set.mockRejectedValue(new Error('storage unavailable'));
  await expect(createQuorumAssignmentCoordinator(value).write('app', 'node')).rejects.toThrow('storage unavailable');
});

test('derives quorum size from observations when no cluster size is configured', async () => {
  const value = context();
  const coordinator = createQuorumAssignmentCoordinator({ ...value, environment: {} });
  await expect(coordinator.write('app', 'node')).resolves.toBe('node');
});
