import { expect, jest, test } from '@jest/globals';
import { createSupervisorRecoveryJoiner } from '../../src/runtime/recovery-join-wiring.mjs';

test('creates a sequential winner-side recovery joiner', async () => {
  const fetchImpl = jest.fn(async () => ({ ok: true, status: 202, json: async () => ({ ok: true, data: { status: 'ready' } }) }));
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
  const fetchImpl = jest.fn(async () => ({ ok: true, status: 202, json: async () => ({ ok: true, data: { status: 'ready' } }) }));
  const publishRecovery = jest.fn(async () => true);
  const joiner = createSupervisorRecoveryJoiner({ identity: { name: 'node-a' }, token: 'secret', timeoutMs: 10, recoveryState: { set: jest.fn() }, recoveryAudit: {}, publishRecovery, log: {}, fetchImpl });
  await expect(joiner({ bootstrap: { epoch: 2, clusterId: 'c' }, members: [{ name: 'node-a', address: 'node-a' }, { name: 'node-b', address: 'node-b' }, { name: 'node-c', address: 'node-c' }] })).resolves.toEqual({ completed: ['node-b', 'node-c'] });
  expect(fetchImpl.mock.calls.map(([url]) => url)).toEqual(['http://node-b:8080/api/v1/cluster/cold-recovery/join', 'http://node-c:8080/api/v1/cluster/cold-recovery/join']);
  expect(publishRecovery).toHaveBeenCalledTimes(1);
});

test('does not publish recovery when a joiner fails', async () => {
  const fetchImpl = jest.fn(async () => ({ ok: false, status: 409, json: async () => ({ ok: false, error: 'join refused', code: 'JOIN_REFUSED' }) }));
  const publishRecovery = jest.fn();
  const joiner = createSupervisorRecoveryJoiner({ identity: { name: 'node-a' }, token: 'secret', timeoutMs: 10, recoveryState: { set: jest.fn() }, recoveryAudit: { failure: jest.fn() }, publishRecovery, log: { error: jest.fn() }, fetchImpl });
  await expect(joiner({ bootstrap: { epoch: 3, clusterId: 'c' }, members: [{ name: 'node-a', address: 'node-a' }, { name: 'node-b', address: 'node-b' }] })).rejects.toMatchObject({ code: 'JOIN_REFUSED' });
  expect(publishRecovery).not.toHaveBeenCalled();
});
