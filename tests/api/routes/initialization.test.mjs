import { expect, jest, test } from '@jest/globals';
import { handleInitializationRoute } from '../../../src/api/routes/initialization.mjs';

const response = () => ({ json: jest.fn() });
const request = (body) => ({ async *[Symbol.asyncIterator]() { yield JSON.stringify(body); } });
const call = (method, path, body, environment = {}) => handleInitializationRoute({ method, path, body, request: request(body), response: response(), db: { query: jest.fn(async () => [[]]) }, environment, dataDir: 'C:\\missing' });

test('handles initialization planning and verification defaults', async () => {
  await expect(call('POST', '/api/v1/initialization/plan', {})).resolves.toBe(true);
  await expect(call('POST', '/api/v1/initialization/verify', {})).resolves.toBe(true);
  await expect(call('GET', '/api/v1/initialization', {})).resolves.toBe(true);
});

test('applies initialization with database, user, and no configured values', async () => {
  const db = { query: jest.fn(async () => [[]]) };
  const base = { method: 'POST', path: '/api/v1/initialization/apply', request: request({ confirm: true }), response: response(), db, environment: {}, dataDir: 'missing' };
  await expect(handleInitializationRoute(base)).resolves.toBe(true);
  expect(db.query).toHaveBeenCalledWith('FLUSH PRIVILEGES');
  await expect(call('POST', '/api/v1/initialization/apply', { confirm: false })).rejects.toMatchObject({ statusCode: 409 });
});
test('handles each optional initialization value independently', async () => {
  const db = { query: jest.fn(async () => [[]]) };
  for (const body of [{ confirm: true, database: 'app' }, { confirm: true, user: 'runtime', password: 'secret' }]) await expect(handleInitializationRoute({ method: 'POST', path: '/api/v1/initialization/apply', request: request(body), response: response(), db, environment: {}, dataDir: 'missing' })).resolves.toBe(true);
});
test('uses the metadata initializer when configured', async () => {
  const initialize = jest.fn(async () => ({ database: 'elera_meta', initialized: true }));
  await expect(handleInitializationRoute({ method: 'POST', path: '/api/v1/initialization/apply', request: request({ confirm: true }), response: response(), metadata: { initialize }, environment: { ELERA_DEBUG: '1' }, dataDir: 'missing' })).resolves.toBe(true);
  expect(initialize).toHaveBeenCalledWith({ ELERA_DEBUG: '1' });
});
test('does not report initialization success when metadata commit fails', async () => {
  const initialize = jest.fn(async () => { throw new Error('migration failed'); });
  await expect(handleInitializationRoute({ method: 'POST', path: '/api/v1/initialization/apply', request: request({ confirm: true }), response: response(), metadata: { initialize }, environment: {}, dataDir: 'missing' })).rejects.toThrow('migration failed');
});
