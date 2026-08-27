import { expect, jest, test } from '@jest/globals';
import { handleIntentRoute } from '../src/api/routes/intent.mjs';

const response = () => ({ json: jest.fn() });
const request = (body) => ({ async *[Symbol.asyncIterator]() { yield JSON.stringify(body); } });
const intent = { apiVersion: 'elera.eliware.dev/v1alpha1', kind: 'SupervisorIntent', cluster: { name: 'c', members: [{ name: 'n', address: 'a' }] }, mariadb: { port: 3306 }, routing: { healthIntervalMs: 1000 }, drain: { queryTimeoutMs: 1 } };
const context = (method, path, body = {}) => ({ method, path, request: request(body), response: response(), environment: { ELERA: '1', ELERA_CLUSTER_NAME: 'c' } });

test('handles intent inspection, raw and wrapped plans, apply, and verify', async () => {
  const state = Object.assign(async () => intent, { apply: async () => ({ applied: true }), verify: async () => ({ verified: true }) });
  expect(await handleIntentRoute(context('GET', '/api/v1/config/intent'))).toBe(true);
  expect(await handleIntentRoute({ ...context('POST', '/api/v1/config/plan', intent), getActiveIntent: state })).toBe(true);
  expect(await handleIntentRoute({ ...context('POST', '/api/v1/config/plan', { intent }), getActiveIntent: state })).toBe(true);
  expect(await handleIntentRoute({ ...context('POST', '/api/v1/config/apply', { confirm: true, intent }), getActiveIntent: state })).toBe(true);
  expect(await handleIntentRoute({ ...context('POST', '/api/v1/config/verify'), getActiveIntent: state })).toBe(true);
});

test('rejects unsafe, unconfirmed, and unconfigured intent operations', async () => {
  await expect(handleIntentRoute(context('POST', '/api/v1/config/apply', {}))).rejects.toMatchObject({ statusCode: 409 });
  const unconfigured = Object.assign(async () => ({}), { apply: undefined });
  await expect(handleIntentRoute({ ...context('POST', '/api/v1/config/apply', { confirm: true, intent }), getActiveIntent: unconfigured })).rejects.toMatchObject({ statusCode: 503 });
  await expect(handleIntentRoute({ ...context('POST', '/api/v1/config/verify'), getActiveIntent: async () => ({}) })).rejects.toMatchObject({ statusCode: 503 });
  const unsafe = Object.assign(async () => intent, { apply: async () => {}, verify: async () => ({}) });
  await expect(handleIntentRoute({ ...context('POST', '/api/v1/config/apply', { confirm: true, intent: { ...intent, cluster: { name: 'c', members: [{ name: 'n', address: 'changed' }] } } }), getActiveIntent: unsafe })).rejects.toMatchObject({ statusCode: 409, code: 'UNSAFE_INTENT_CHANGE' });
});
