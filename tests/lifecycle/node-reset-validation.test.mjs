import { expect, jest, test } from '@jest/globals';
import { validateNodeDataReset } from '../../src/lifecycle/node-reset-validation.mjs';

const base = { node: 'node-a', expectedPath: 'C:\\data', request: { node: 'node-a', dataDir: 'C:\\data', confirmation: 'RESET node-a', dryRun: true }, getStatus: async () => ({ values: {} }) };
test('validates a dry-run reset request', async () => { await expect(validateNodeDataReset(base)).resolves.toMatchObject({ dryRun: true, resync: false, initialized: false }); });
test('rejects unsafe or malformed requests', async () => {
  await expect(validateNodeDataReset({ ...base, request: { ...base.request, node: 'node-b' } })).rejects.toThrow('identity');
  await expect(validateNodeDataReset({ ...base, request: { ...base.request, confirmation: 'wrong' } })).rejects.toThrow('confirmation');
  await expect(validateNodeDataReset({ ...base, request: { ...base.request, dryRun: 'yes' } })).rejects.toThrow('boolean');
  await expect(validateNodeDataReset({ ...base, request: { ...base.request, dryRun: false } })).rejects.toThrow('idempotencyKey');
  await expect(validateNodeDataReset({ ...base, request: { ...base.request, dataDir: 'C:\\other' } })).rejects.toThrow('data directory');
});
test('supports offline recovery and resync validation', async () => { const getStatus = jest.fn().mockRejectedValue(new Error('offline')); await expect(validateNodeDataReset({ ...base, getStatus, offlineRecovery: true, request: { ...base.request, dryRun: true, offline: true, recoveryDisposition: 'single-member-resync' } })).resolves.toMatchObject({ resync: true }); });
test('covers executing, default, and status edge conditions', async () => {
  await expect(validateNodeDataReset({ ...base, request: { node: 'node-a', dataDir: 'C:\\data', confirmation: 'RESET node-a', idempotencyKey: 'key' }, getRecoveryState: () => null })).resolves.toMatchObject({ dryRun: false, key: 'key' });
  await expect(validateNodeDataReset({ ...base, request: { ...base.request, dryRun: false, idempotencyKey: 'key' }, getStatus: async () => ({ values: { wsrep_local_state_comment: 'Synced' } }) })).rejects.toThrow('healthy');
  await expect(validateNodeDataReset({ ...base, request: { ...base.request, dryRun: false, idempotencyKey: 'key' }, getStatus: async () => ({ values: { wsrep_cluster_status: 'Primary' } }) })).rejects.toThrow('healthy');
  await expect(validateNodeDataReset({ ...base, getStatus: async () => { throw new Error('offline'); } })).rejects.toThrow('offline');
});
test('rejects healthy, ambiguous, and unsafe initialized nodes', async () => {
  await expect(validateNodeDataReset({ ...base, getStatus: async () => ({ ready: true, values: {} }) })).rejects.toThrow('healthy');
  await expect(validateNodeDataReset({ ...base, getRecoveryState: () => ({ state: 'awaiting-quorum' }) })).rejects.toThrow('ambiguous');
  await expect(validateNodeDataReset({ ...base, getStatus: async () => ({ initialized: true, values: {} }) })).rejects.toThrow('initialized');
  await expect(validateNodeDataReset({ ...base, getStatus: async () => ({ values: {}, recovery: { state: 'blocked-ambiguous' } }) })).rejects.toThrow('ambiguous');
  await expect(validateNodeDataReset({ ...base, request: { ...base.request, force: true, recoveryDisposition: 'reset-initialized-data' }, getStatus: async () => ({ initialized: true, values: {} }) })).resolves.toMatchObject({ initialized: true });
});
