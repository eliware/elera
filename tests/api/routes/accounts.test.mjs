import { expect, jest, test } from '@jest/globals';
import { handleAccountRoute } from '../../../src/api/routes/accounts.mjs';

const response = () => ({ status: 0, body: '', writeHead(status) { this.status = status; return this; }, end(body) { this.body = body; return this; } });
const request = (body) => ({ async *[Symbol.asyncIterator]() { if (body) yield JSON.stringify(body); } });
test('account route handles listing, export, import and unknown paths', async () => { const db = { query: async (sql) => sql.includes('SHOW GRANTS') ? [[{ grant: 'GRANT USAGE' }]] : [[{ User: 'app', Host: '%' }]] }; const list = response(); expect(await handleAccountRoute({ method: 'GET', path: '/api/v1/accounts', request: request(), response: list, db })).toBe(true); const exported = response(); expect(await handleAccountRoute({ method: 'POST', path: '/api/v1/accounts/export', request: request(), response: exported, db })).toBe(true); const imported = response(); expect(await handleAccountRoute({ method: 'POST', path: '/api/v1/accounts/import', request: request({ confirm: true, accounts: [{ user: 'app', grants: [] }] }), response: imported, db })).toBe(true); expect(await handleAccountRoute({ method: 'GET', path: '/missing', request: request(), response: response(), db })).toBe(false); });

test('delegates managed account provision, revoke, and verification outcomes', async () => {
  const db = { query: async (sql) => sql.startsWith('SHOW GRANTS') ? [[], []] : [[]] };
  const context = (path, body) => ({ method: 'POST', path, request: request(body), response: response(), db });
  await expect(handleAccountRoute(context('/api/v1/accounts/provision', { user: 'app', database: 'db' }))).resolves.toBe(true);
  await expect(handleAccountRoute(context('/api/v1/accounts/revoke', { user: 'app' }))).resolves.toBe(true);
  await expect(handleAccountRoute(context('/api/v1/accounts/verify', { user: 'app' }))).resolves.toBe(true);
});
test('returns unavailable when account verification finds no grants', async () => {
  const out = response();
  const db = { query: async () => [[], []] };
  await expect(handleAccountRoute({ method: 'POST', path: '/api/v1/accounts/verify', request: request({ user: 'missing' }), response: out, db })).resolves.toBe(true);
  expect(out.status).toBe(503);
});

test('rejects unsafe imported grant statements and missing confirmation', async () => {
  const db = { query: async () => [[]] };
  await expect(handleAccountRoute({ method: 'POST', path: '/api/v1/accounts/import', request: request({ accounts: [] }), response: response(), db })).rejects.toMatchObject({ statusCode: 409 });
  await expect(handleAccountRoute({ method: 'POST', path: '/api/v1/accounts/import', request: request({ confirm: true, accounts: [{ user: 'app', grants: ['DROP;'] }] }), response: response(), db })).rejects.toMatchObject({ statusCode: 400 });
});
test('rejects imported statements that are not privilege grants', async () => {
  const db = { query: async () => [[]] };
  await expect(handleAccountRoute({ method: 'POST', path: '/api/v1/accounts/import', request: request({ confirm: true, accounts: [{ user: 'app', grants: ['DROP DATABASE production'] }] }), response: response(), db })).rejects.toMatchObject({ statusCode: 400 });
});

test('exports accounts when grant lookup fails or returns an empty grant row', async () => {
  let grantCalls = 0;
  const db = { query: async (sql) => {
    if (sql.includes('FROM mysql.user')) return [[{ User: 'one', Host: '%' }, { User: 'two', Host: 'localhost' }]];
    grantCalls += 1;
    if (grantCalls === 1) throw new Error('grant lookup failed');
    return [[{}]];
  } };
  const out = response();
  await expect(handleAccountRoute({ method: 'POST', path: '/api/v1/accounts/export', request: request(), response: out, db })).resolves.toBe(true);
  expect(out.status).toBe(200);
});
test('imports accounts with omitted account and grant collections', async () => {
  const db = { query: async () => [[]] };
  await expect(handleAccountRoute({ method: 'POST', path: '/api/v1/accounts/import', request: request({ confirm: true, accounts: [{ user: 'app' }] }), response: response(), db })).resolves.toBe(true);
});
test('uses the shared JSON response writer when no response helper is provided', async () => {
  const target = { writeHead: jest.fn(function () { return this; }), setHeader: jest.fn(), end: jest.fn() };
  await expect(handleAccountRoute({ method: 'GET', path: '/api/v1/accounts', request: request(), response: target, db: { query: async () => [[]] } })).resolves.toBe(true);
  expect(target.writeHead).toHaveBeenCalledWith(200, expect.any(Object));
});
test('uses a response helper and defaults null account collections', async () => {
  const target = { json: jest.fn() };
  await expect(handleAccountRoute({ method: 'GET', path: '/api/v1/accounts', request: request(), response: target, db: { query: async () => [[]] } })).resolves.toBe(true);
  await expect(handleAccountRoute({ method: 'POST', path: '/api/v1/accounts/import', request: request({ confirm: true, accounts: [{ user: 'app', host: null, grants: null }] }), response: target, db: { query: async () => [[]] } })).resolves.toBe(true);
  await expect(handleAccountRoute({ method: 'POST', path: '/api/v1/accounts/import', request: request({ confirm: true, accounts: null }), response: target, db: { query: async () => [[]] } })).resolves.toBe(true);
});
test('returns healthy when account verification finds grants', async () => {
  const out = response();
  await expect(handleAccountRoute({ method: 'POST', path: '/api/v1/accounts/verify', request: request({ user: 'app' }), response: out, db: { query: async () => [[{ grant: 'GRANT USAGE' }], []] } })).resolves.toBe(true);
  expect(out.status).toBe(200);
});
