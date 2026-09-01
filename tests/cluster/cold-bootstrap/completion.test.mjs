import { expect, jest, test } from '@jest/globals';
import { createRecoveryCompletion, waitForRecoveryCompletion } from '../../../src/cluster/cold-bootstrap/completion.mjs';

test('publishes only complete epoch handoffs', () => {
  const completion = createRecoveryCompletion();
  expect(() => completion.publish({ epoch: 'e', status: 'authorized' })).toThrow();
  expect(completion.publish({ epoch: 'e', status: 'complete' })).toMatchObject({ epoch: 'e', status: 'complete' });
  expect(completion.publish({ epoch: 'e2', status: 'failed' })).toMatchObject({ status: 'failed' });
});

test('does not let a late failure overwrite completed recovery', () => {
  const completion = createRecoveryCompletion();
  const complete = completion.publish({ epoch: 'e', status: 'complete' });
  expect(completion.publish({ epoch: 'e', status: 'failed', reason: 'late timeout' })).toBe(complete);
  expect(completion.read()).toBe(complete);
});

test('waits for matching completion and rejects a different epoch', async () => {
  const responses = [
    { ok: true, json: async () => ({ data: { epoch: 'other', status: 'complete' } }) },
    { ok: true, json: async () => ({ data: { epoch: 'e', status: 'complete' } }) },
  ];
  const fetchImpl = jest.fn(async () => responses.shift());
  await expect(waitForRecoveryCompletion({ url: 'http://winner', epoch: 'e', token: 't', fetchImpl, timeoutMs: 100, intervalMs: 1 })).resolves.toMatchObject({ epoch: 'e' });
  expect(fetchImpl).toHaveBeenCalledTimes(2);
});
test('handles failed responses, malformed responses, and fetch errors', async () => {
  const responses = [{ ok: false }, { ok: true, json: async () => { throw new Error('bad json'); } }];
  const fetchImpl = jest.fn(async () => responses.shift() ?? Promise.reject(new Error('offline')));
  await expect(waitForRecoveryCompletion({ url: 'http://winner/', epoch: 'e', fetchImpl, timeoutMs: 2, intervalMs: 0 })).rejects.toMatchObject({ code: 'RECOVERY_COMPLETION_TIMEOUT' });
  const completion = createRecoveryCompletion();
  expect(completion.read()).toBeUndefined();
  await expect(waitForRecoveryCompletion({ url: 'http://winner', epoch: 'e', fetchImpl: null })).rejects.toThrow('dependencies');
});
