import { expect, jest, test } from '@jest/globals';
import { handleRecoveryRoute } from '../src/api/routes/recovery.mjs';
import { createRecoveryControl } from '../src/recovery/control.mjs';
import { createRecoveryState } from '../src/cluster/cold-bootstrap/recovery-state.mjs';

const request = (body = {}) => ({ async *[Symbol.asyncIterator]() { yield JSON.stringify(body); } });
const response = () => ({ json: jest.fn() });

test('serves recovery status/events and handles confirmed acknowledge/abort', async () => {
  const recovery = createRecoveryControl({ state: createRecoveryState() });
  const out = response();
  const auth = { root: true };
  await handleRecoveryRoute({ method: 'GET', path: '/api/v1/recovery/status', response: out, recovery, auth });
  await handleRecoveryRoute({ method: 'GET', path: '/api/v1/recovery/events', response: out, recovery, auth });
  await handleRecoveryRoute({ method: 'POST', path: '/api/v1/recovery/acknowledge', request: request({ confirm: true, reason: 'ok' }), response: out, recovery, auth });
  await handleRecoveryRoute({ method: 'POST', path: '/api/v1/recovery/abort', request: request({ confirm: true, reason: 'stop' }), response: out, recovery, auth });
  expect(out.json).toHaveBeenCalledTimes(4);
  expect(recovery.events()).toHaveLength(2);
});

test('requires confirmation and ignores unrelated routes', async () => {
  const recovery = createRecoveryControl({ state: createRecoveryState() });
  const auth = { root: true };
  await expect(handleRecoveryRoute({ method: 'POST', path: '/api/v1/recovery/abort', request: request(), response: response(), recovery, auth })).rejects.toMatchObject({ statusCode: 409 });
  await expect(handleRecoveryRoute({ method: 'GET', path: '/other', response: response(), recovery, auth })).resolves.toBe(false);
  await expect(handleRecoveryRoute({ method: 'POST', path: '/api/v1/recovery/acknowledge', request: request(), response: response(), recovery, auth })).rejects.toThrow('recovery acknowledgement');
  await expect(handleRecoveryRoute({ method: 'GET', path: '/api/v1/recovery/status', response: response() })).resolves.toBe(false);
  await expect(handleRecoveryRoute({ method: 'GET', path: '/api/v1/recovery/status', response: response(), recovery, auth: { scopes: [] } })).resolves.toBe(false);
  await expect(handleRecoveryRoute({ method: 'GET', path: '/api/v1/recovery/events', response: response(), recovery, auth: { scopes: [] } })).resolves.toBe(false);
  await expect(handleRecoveryRoute({ method: 'POST', path: '/api/v1/recovery/acknowledge', request: request({ confirm: true }), response: response(), recovery, auth: { scopes: [] } })).resolves.toBe(false);
  await expect(handleRecoveryRoute({ method: 'GET', path: '/api/v1/recovery/status', response: response() })).resolves.toBe(false);
});
