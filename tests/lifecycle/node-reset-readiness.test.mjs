import { expect, jest, test } from '@jest/globals';
import { isSyncedPrimary, waitForReady } from '../../src/lifecycle/node-reset-readiness.mjs';

const ready = { values: { wsrep_local_state_comment: 'Synced', wsrep_ready: 'ON', wsrep_cluster_status: 'Primary' } };
test('recognizes only Synced Primary status', () => { expect(isSyncedPrimary(ready)).toBe(true); expect(isSyncedPrimary({ values: { ...ready.values, wsrep_ready: 'OFF' } })).toBe(false); expect(isSyncedPrimary()).toBe(false); });
test('polls until the node is ready', async () => { const getStatus = jest.fn().mockResolvedValueOnce({}).mockResolvedValueOnce(ready); const sleep = jest.fn(async () => {}); await expect(waitForReady({ getStatus, timeoutMs: 100, intervalMs: 1, sleep })).resolves.toBe(ready); expect(getStatus).toHaveBeenCalledTimes(2); });
test('continues after status errors and fails at the deadline', async () => { const getStatus = jest.fn().mockRejectedValue(new Error('offline')); const sleep = jest.fn(async () => {}); await expect(waitForReady({ getStatus, timeoutMs: 0, intervalMs: 1, sleep, failure: (message, status) => Object.assign(new Error(message), { status }) })).rejects.toMatchObject({ status: 504 }); });
test('uses default sleep and failure dependencies', async () => { await expect(waitForReady({ getStatus: async () => ({}), timeoutMs: 0, intervalMs: 1 })).rejects.toThrow('single-member-resync'); });
