import { describe, expect, test, jest } from '@jest/globals';
import { calculateWeight, createHealthService } from '../src/health.mjs';

const values = { wsrep_local_state_comment: 'Synced', wsrep_ready: 'ON', wsrep_cluster_status: 'Primary', wsrep_cluster_size: '3', wsrep_local_recv_queue: '0', wsrep_local_send_queue: '0', wsrep_flow_control_paused: '0' };
describe('health service', () => {
  test('caches concurrent and subsequent checks', async () => { const query = jest.fn(async () => [[...Object.entries(values).map(([Variable_name, Value]) => ({ Variable_name, Value }))]]); const service = createHealthService({ db: { query }, timeoutMs: 100, clusterSize: 3, log: { debug: jest.fn() } }); expect((await Promise.all([service.status(), service.status()]))[0].ready).toBe(true); await service.status(); expect(query).toHaveBeenCalledTimes(1); expect(service.cacheInfo().cached).toBe(true); });
  test('requires quorum for an Elera cluster', async () => { const query = jest.fn(async () => [[...Object.entries({ ...values, wsrep_cluster_size: '1' }).map(([Variable_name, Value]) => ({ Variable_name, Value }))]]); const service = createHealthService({ db: { query }, timeoutMs: 100, clusterSize: 3, log: { debug: jest.fn() } }); expect((await service.status()).ready).toBe(false); });
  test('keeps recovery states unavailable during startup and permits authorized state', async () => {
    const query = jest.fn(async () => [[...Object.entries(values).map(([Variable_name, Value]) => ({ Variable_name, Value }))]]);
    const blocked = createHealthService({ db: { query }, timeoutMs: 100, clusterSize: 3, getRecoveryState: () => ({ state: 'awaiting-quorum' }), log: { debug: jest.fn() } });
    expect((await blocked.status()).ready).toBe(false);
    const authorized = createHealthService({ db: { query }, timeoutMs: 100, clusterSize: 3, getRecoveryState: () => ({ state: 'recovery-authorized' }), log: { debug: jest.fn() } });
    expect((await authorized.status()).ready).toBe(false);
    for (const state of ['bootstrapping', 'joining']) {
      const recovering = createHealthService({ db: { query }, timeoutMs: 100, clusterSize: 3, getRecoveryState: () => ({ state }), log: { debug: jest.fn() } });
      expect((await recovering.status()).ready).toBe(false);
    }
  });
  test('calculates safe and pressured weights', () => { expect(calculateWeight(values)).toBe(100); expect(calculateWeight({ ...values, wsrep_local_state_comment: 'Joining' })).toBe(0); expect(calculateWeight({ ...values, wsrep_local_recv_queue: '17' })).toBe(0); expect(calculateWeight({ ...values, wsrep_flow_control_paused: '0.05' })).toBe(0); });
  test('reports unavailable database and query timeout', async () => { const service = createHealthService({ db: undefined, timeoutMs: 1, log: { debug: jest.fn() } }); await expect(service.status()).rejects.toThrow('unavailable'); const slow = createHealthService({ db: { query: () => new Promise(() => {}) }, timeoutMs: 1, log: { debug: jest.fn() } }); await expect(slow.status()).rejects.toThrow('timeout'); });
  test('rejects an invalid SQL status result without destructuring it', async () => { const service = createHealthService({ db: { query: async () => undefined }, timeoutMs: 10, log: { debug: jest.fn() } }); await expect(service.status()).rejects.toThrow('invalid result'); });
});
