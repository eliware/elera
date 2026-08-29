import { expect, jest, test } from '@jest/globals';
import { handleStatusRoute } from '../../../src/api/routes/status.mjs';

test('returns status and computes fallback configuration', async () => {
  const response = { json: jest.fn() };
  await expect(handleStatusRoute({ method: 'GET', path: '/api/v1/status', response, getStatus: async () => ({ ready: true }) })).resolves.toBe(true);
  await expect(handleStatusRoute({ method: 'GET', path: '/api/v1/config', response, environment: { ELERA_CLUSTER_MODE: '1' } })).resolves.toBe(true);
  await expect(handleStatusRoute({ method: 'GET', path: '/api/v1/config', response, environment: {}, getConfig: async () => ({ custom: true }) })).resolves.toBe(true);
  expect(await handleStatusRoute({ method: 'POST', path: '/api/v1/status', response })).toBe(false);
});
