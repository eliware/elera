import { jest } from '@jest/globals';
import { createBootstrapWatch } from '../../../src/cluster/cold-bootstrap/bootstrap-watch.mjs';

test('returns when the winner becomes ready', async () => {
  const health = { status: jest.fn().mockResolvedValueOnce({ ready: false }).mockResolvedValue({ ready: true }) };
  await expect(createBootstrapWatch({ health, timeoutMs: 100, intervalMs: 0 })()).resolves.toEqual({ ready: true });
});

test('times out and invokes fencing callback', async () => {
  const onTimeout = jest.fn(); const health = { status: jest.fn().mockResolvedValue({ ready: false }) };
  await expect(createBootstrapWatch({ health, timeoutMs: 0, onTimeout })()).resolves.toEqual({ ready: false, timedOut: true });
  expect(onTimeout).toHaveBeenCalledTimes(1);
});

test('supports seed readiness before full cluster quorum exists', async () => {
  const onTimeout = jest.fn(); const health = { status: async () => ({ ready: false, values: { wsrep_local_state_comment: 'Synced', wsrep_ready: 'ON', wsrep_cluster_status: 'Primary' } }) };
  const watch = createBootstrapWatch({ health, timeoutMs: 1, isReady: (result) => result.values.wsrep_local_state_comment === 'Synced', onTimeout });
  await expect(watch()).resolves.toEqual({ ready: true });
  expect(onTimeout).not.toHaveBeenCalled();
});

test('validates dependencies', () => expect(() => createBootstrapWatch()).toThrow('bootstrap watch dependencies are required'));
