import { expect, jest, test } from '@jest/globals';
import { createSupervisorRecoveryJoiner } from '../../src/runtime/recovery-join-wiring.mjs';

test('creates a sequential winner-side recovery joiner', async () => {
  const fetchImpl = jest.fn(async (url) => url.endsWith('/status')
    ? ({ ok: true, status: 200, json: async () => ({ ok: true, data: { values: { wsrep_cluster_state_uuid: 'c', wsrep_cluster_size: '2', wsrep_local_state_comment: 'Synced', wsrep_ready: 'ON', wsrep_cluster_status: 'Primary' } } }) })
    : ({ ok: true, status: 202, json: async () => ({ ok: true, data: { status: 'ready' } }) }));
  const publishRecovery = jest.fn(async () => true);
  const joiner = createSupervisorRecoveryJoiner({ identity: { name: 'node-a' }, token: 'secret', timeoutMs: 10, httpPort: 8080, recoveryState: { set: jest.fn() }, recoveryAudit: { joinComplete: jest.fn() }, publishRecovery, log: {}, fetchImpl });
  expect(typeof joiner).toBe('function');
  await expect(joiner({ bootstrap: { epoch: 1, clusterId: 'c' }, members: [{ name: 'node-a', address: 'node-a' }, { name: 'node-b', address: 'node-b' }] })).resolves.toEqual({ completed: ['node-b'] });
  expect(fetchImpl).toHaveBeenCalledWith(expect.stringContaining('node-b'), expect.objectContaining({ method: 'POST' }));
  expect(publishRecovery).toHaveBeenCalledWith({ members: ['node-b'] });
});

test('uses a no-op completion publisher when none is supplied', async () => {
  const joiner = createSupervisorRecoveryJoiner({ identity: { name: 'node-a' }, token: 'secret', timeoutMs: 10, recoveryState: { set: jest.fn() }, recoveryAudit: {}, log: {}, fetchImpl: jest.fn() });
  await expect(joiner({ members: [] })).resolves.toEqual({ completed: [] });
});

test('recovers two joiners sequentially before publishing completion', async () => {
  const fetchImpl = jest.fn(async (url) => url.endsWith('/status')
    ? ({ ok: true, status: 200, json: async () => ({ ok: true, data: { values: { wsrep_cluster_state_uuid: 'c', wsrep_cluster_size: '3', wsrep_local_state_comment: 'Synced', wsrep_ready: 'ON', wsrep_cluster_status: 'Primary' } } }) })
    : ({ ok: true, status: 202, json: async () => ({ ok: true, data: { status: 'ready' } }) }));
  const publishRecovery = jest.fn(async () => true);
  const joiner = createSupervisorRecoveryJoiner({ identity: { name: 'node-a' }, token: 'secret', timeoutMs: 10, recoveryState: { set: jest.fn() }, recoveryAudit: {}, publishRecovery, log: {}, fetchImpl });
  await expect(joiner({ bootstrap: { epoch: 2, clusterId: 'c' }, members: [{ name: 'node-a', address: 'node-a' }, { name: 'node-b', address: 'node-b' }, { name: 'node-c', address: 'node-c' }] })).resolves.toEqual({ completed: ['node-b', 'node-c'] });
  expect(fetchImpl.mock.calls.map(([url]) => url)).toEqual([
    'http://node-b:8080/api/v1/cluster/cold-recovery/join', 'http://node-b:8080/api/v1/cluster/status',
    'http://node-c:8080/api/v1/cluster/cold-recovery/join', 'http://node-c:8080/api/v1/cluster/status',
  ]);
  expect(publishRecovery).toHaveBeenCalledTimes(1);
});

test('does not publish recovery when a joiner fails', async () => {
  const fetchImpl = jest.fn(async () => ({ ok: false, status: 409, json: async () => ({ ok: false, error: 'join refused', code: 'JOIN_REFUSED' }) }));
  const publishRecovery = jest.fn();
  const joiner = createSupervisorRecoveryJoiner({ identity: { name: 'node-a' }, token: 'secret', timeoutMs: 10, recoveryState: { set: jest.fn() }, recoveryAudit: { failure: jest.fn() }, publishRecovery, log: { error: jest.fn() }, fetchImpl });
  await expect(joiner({ bootstrap: { epoch: 3, clusterId: 'c' }, members: [{ name: 'node-a', address: 'node-a' }, { name: 'node-b', address: 'node-b' }] })).rejects.toMatchObject({ code: 'JOIN_REFUSED' });
  expect(publishRecovery).not.toHaveBeenCalled();
});

test('rejects a join that is acknowledged but not Primary and Synced', async () => {
  const fetchImpl = jest.fn(async (url) => url.endsWith('/status')
    ? ({ ok: true, status: 200, json: async () => ({ ok: true, data: { values: { wsrep_cluster_state_uuid: 'c', wsrep_cluster_size: '2', wsrep_local_state_comment: 'Joining', wsrep_ready: 'OFF', wsrep_cluster_status: 'Non-Primary' } } }) })
    : ({ ok: true, status: 202, json: async () => ({ ok: true, data: { status: 'ready' } }) }));
  const joiner = createSupervisorRecoveryJoiner({ identity: { name: 'node-a' }, token: 'secret', timeoutMs: 10, recoveryState: { set: jest.fn() }, recoveryAudit: { failure: jest.fn() }, log: { error: jest.fn() }, fetchImpl });
  await expect(joiner({ bootstrap: { epoch: 4, clusterId: 'c' }, members: [{ name: 'node-a', address: 'node-a' }, { name: 'node-b', address: 'node-b' }] })).rejects.toMatchObject({ code: 'JOINER_NOT_READY', node: 'node-b' });
});

test('rejects a join when status endpoint fails or returns invalid JSON', async () => {
  const fetchImpl = jest.fn(async (url) => url.endsWith('/status')
    ? ({ ok: false, status: 503, json: async () => { throw new Error('invalid json'); } })
    : ({ ok: true, status: 202, json: async () => ({ ok: true, data: {} }) }));
  const joiner = createSupervisorRecoveryJoiner({ identity: { name: 'node-a' }, token: 'secret', timeoutMs: 10, recoveryState: { set: jest.fn() }, recoveryAudit: { failure: jest.fn() }, log: { error: jest.fn() }, fetchImpl });
  await expect(joiner({ bootstrap: { epoch: 5, clusterId: 'c' }, members: [{ name: 'node-a' }, { name: 'node-b', url: 'http://node-b/' }] })).rejects.toMatchObject({ code: 'JOINER_NOT_READY' });
});

test('accepts direct status data and preserves a custom join URL', async () => {
  const fetchImpl = jest.fn(async (url) => url.endsWith('/status')
    ? ({ ok: true, status: 200, json: async () => ({ ok: true, data: { wsrep_cluster_state_uuid: 'c', wsrep_cluster_size: '2', wsrep_local_state_comment: 'Synced', wsrep_ready: 'ON', wsrep_cluster_status: 'Primary' } }) })
    : ({ ok: true, status: 202, json: async () => ({ ok: true, data: {} }) }));
  const joiner = createSupervisorRecoveryJoiner({ identity: { name: 'node-a' }, token: 'secret', timeoutMs: 10, recoveryState: { set: jest.fn() }, recoveryAudit: {}, fetchImpl });
  await expect(joiner({ bootstrap: { clusterId: 'c' }, members: [{ name: 'node-a' }, { name: 'node-b', url: 'http://custom/' }] })).resolves.toEqual({ completed: ['node-b'] });
  expect(fetchImpl.mock.calls[0][0]).toBe('http://custom/api/v1/cluster/cold-recovery/join');
});

test('rejects a successful status response without status data', async () => {
  const fetchImpl = jest.fn(async (url) => url.endsWith('/status')
    ? ({ ok: true, status: 200, json: async () => ({ ok: true }) })
    : ({ ok: true, status: 202, json: async () => ({ ok: true, data: {} }) }));
  const joiner = createSupervisorRecoveryJoiner({ identity: { name: 'node-a' }, token: 'secret', timeoutMs: 10, recoveryState: { set: jest.fn() }, recoveryAudit: { failure: jest.fn() }, log: { error: jest.fn() }, fetchImpl });
  await expect(joiner({ bootstrap: { clusterId: 'c' }, members: [{ name: 'node-a' }, { name: 'node-b' }] })).rejects.toMatchObject({ code: 'JOINER_NOT_READY' });
});
