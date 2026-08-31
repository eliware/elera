import { expect, jest, test } from '@jest/globals';
import { createRecoveryJoinClient } from '../../src/runtime/recovery-join-client.mjs';

test('posts an authenticated recovery join request and returns its data', async () => {
  const fetchImpl = jest.fn().mockResolvedValue({ ok: true, status: 202, json: async () => ({ ok: true, data: { status: 'joining' } }) });
  const client = createRecoveryJoinClient({ token: 'secret', fetchImpl });
  await expect(client.join({ url: 'http://node-b/', epoch: 4, clusterId: 'cluster-a' })).resolves.toEqual({ status: 'joining' });
  expect(fetchImpl).toHaveBeenCalledWith('http://node-b/api/v1/cluster/cold-recovery/join', expect.objectContaining({ method: 'POST', body: JSON.stringify({ epoch: 4, clusterId: 'cluster-a' }), headers: expect.objectContaining({ authorization: 'Bearer secret' }) }));
});

test('reports structured remote join failures', async () => {
  const client = createRecoveryJoinClient({ fetchImpl: async () => ({ ok: false, status: 409, json: async () => ({ ok: false, error: 'UUID mismatch', code: 'JOIN_UUID_MISMATCH' }) }) });
  await expect(client.join({ url: 'http://node-b', epoch: 4 })).rejects.toMatchObject({ message: 'UUID mismatch', code: 'JOIN_UUID_MISMATCH', statusCode: 409 });
});

test('handles non-JSON and unstructured remote failures', async () => {
  const client = createRecoveryJoinClient({ fetchImpl: async () => ({ ok: false, status: 503, json: async () => { throw new Error('not json'); } }) });
  await expect(client.join({ url: 'http://node-b' })).rejects.toMatchObject({ message: 'recovery join returned 503', code: 'RECOVERY_JOIN_FAILED', statusCode: 503 });
});

test('validates join targets and fetch dependency', async () => {
  expect(() => createRecoveryJoinClient({ fetchImpl: null })).toThrow('requires fetch');
  const client = createRecoveryJoinClient({ fetchImpl: jest.fn() });
  await expect(client.join({ epoch: 1 })).rejects.toThrow('target URL is required');
});
