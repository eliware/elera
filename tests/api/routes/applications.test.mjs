import { expect, jest, test } from '@jest/globals';
import { handleApplicationRoute } from '../../../src/api/routes/applications.mjs';

const request = (body) => ({ async *[Symbol.asyncIterator]() { yield JSON.stringify(body); } });
test('creates applications and app-admin tokens for root callers', async () => {
  const response = { json: jest.fn() };
  const applications = { create: jest.fn(async (value) => ({ id: 'app-1', ...value })), issueAdminToken: jest.fn(async (value) => ({ token: 'secret', ...value })) };
  await expect(handleApplicationRoute({ method: 'POST', path: '/api/v1/applications', request: request({ application: 'billing' }), response, auth: { root: true }, applications })).resolves.toBe(true);
  await expect(handleApplicationRoute({ method: 'POST', path: '/api/v1/app-admin/tokens', request: request({ application: 'billing', name: 'owner' }), response, auth: { root: true }, applications })).resolves.toBe(true);
  expect(applications.create).toHaveBeenCalledWith({ name: 'billing' });
  expect(applications.issueAdminToken).toHaveBeenCalledWith({ application: 'billing', tokenName: 'owner' });
  expect(response.json).toHaveBeenCalledTimes(2);
});

test('rejects non-root and unrelated application requests', async () => {
  const response = { json: jest.fn() }; const applications = { create: jest.fn(), issueAdminToken: jest.fn() };
  await expect(handleApplicationRoute({ method: 'POST', path: '/api/v1/applications', request: request({ name: 'x' }), response, auth: {}, applications })).resolves.toBe(false);
  await expect(handleApplicationRoute({ method: 'GET', path: '/other', response, auth: { root: true }, applications })).resolves.toBe(false);
  await expect(handleApplicationRoute({ method: 'POST', path: '/api/v1/applications', request: request({ name: 'x' }), response, auth: { root: true } })).resolves.toBe(false);
});

test('uses tokenName and application fallbacks and returns false without an auth object', async () => {
  const response = { json: jest.fn() };
  const applications = { create: jest.fn(async (value) => value), issueAdminToken: jest.fn(async (value) => value) };
  await expect(handleApplicationRoute({ method: 'POST', path: '/api/v1/applications', request: request({}), response, auth: { root: true }, applications })).resolves.toBe(true);
  await expect(handleApplicationRoute({ method: 'POST', path: '/api/v1/app-admin/tokens', request: request({ application: 'billing', tokenName: 'owner' }), response, auth: { root: true }, applications })).resolves.toBe(true);
  expect(applications.create).toHaveBeenCalledWith({ name: undefined });
  expect(applications.issueAdminToken).toHaveBeenCalledWith({ application: 'billing', tokenName: 'owner' });
  await expect(handleApplicationRoute({ method: 'POST', path: '/api/v1/applications', response, applications })).resolves.toBe(false);
  await expect(handleApplicationRoute({ method: 'POST', path: '/api/v1/app-admin/tokens', request: request({}), response, auth: {}, applications })).resolves.toBe(false);
});
