import { describe, expect, test, jest } from '@jest/globals';
import { createControlApi } from '../src/control-api.mjs';

function request(method, url, body, token = 'root_token_here') {
  return { method, url, headers: token === null ? {} : { authorization: `Bearer ${token}` }, async *[Symbol.asyncIterator]() { if (body) yield JSON.stringify(body); } };
}
function response() { return { status: 0, body: '', writeHead(status) { this.status = status; return this; }, end(body = '') { this.body = body; return this; } }; }

describe('control API', () => {
  test('authenticates and serves MVP routes', async () => {
    const queries = [];
    const db = { query: async (sql) => { queries.push(sql); if (sql.includes('SHOW GRANTS')) return [[{ grant: 'GRANT USAGE ON *.* TO `app`@`%`' }]]; if (sql.includes('mysql.user')) return [[{ User: 'app', Host: '%', plugin: 'mysql_native_password', account_locked: 'N', password_expired: 'N' }]]; return [[]]; } };
    let drained = false; let bootstrapped = false;
    const api = createControlApi({ db, getStatus: async () => ({ ready: false, values: { wsrep_local_state_comment: 'Joining' } }), getTraffic: () => ({ drained }), setDrain: (value) => { drained = value; }, bootstrap: async () => { bootstrapped = true; }, environment: { ROOT_TOKEN: 'root_token_here', GALERA: '1', MARIADB_DATABASE: 'app', MARIADB_USER: 'app' }, log: { error: jest.fn() }, dataDir: 'C:\\missing' });
    const call = async (method, url, body) => { const out = response(); await api.handler(request(method, url, body), out); return { out, value: JSON.parse(out.body) }; };
    expect((await call('GET', '/api/v1/status')).out.status).toBe(200);
    expect((await call('GET', '/api/v1/config')).value.data.galera).toBe(true);
    const leaseApi = createControlApi({ db, getStatus: async () => ({}), getTraffic: () => ({}), setDrain: () => {}, environment: { ROOT_TOKEN: 'root_token_here' }, leaseCredentials: async () => ({ database: 'app', identity: 'runtime', username: 'app', password: 'secret', routes: { primary: [{ host: 'sql0', port: 3306 }], balanced: [{ host: 'sql0', port: 3306 }] }, expiresAt: '2099-01-01T00:00:00Z' }), log: { error: jest.fn() } });
    const leaseOut = response(); await leaseApi.handler(request('POST', '/api/v1/credentials/lease', { database: 'app', identity: 'runtime' }), leaseOut); expect(leaseOut.status).toBe(200);
    expect((await call('GET', '/api/v1/initialization')).out.status).toBe(200);
    expect((await call('POST', '/api/v1/initialization/plan')).value.status).toBe('planned');
    expect((await call('POST', '/api/v1/initialization/verify')).out.status).toBe(200);
    expect((await call('POST', '/api/v1/initialization/apply', { confirm: true })).out.status).toBe(200);
    expect((await call('GET', '/api/v1/cluster/status')).out.status).toBe(200);
    expect((await call('GET', '/api/v1/cluster/bootstrap/eligibility')).value.eligible).toBe(true);
    expect((await call('POST', '/api/v1/cluster/bootstrap/plan')).out.status).toBe(200);
    expect((await call('POST', '/api/v1/cluster/bootstrap', { confirm: true })).out.status).toBe(202);
    expect(bootstrapped).toBe(true);
    expect((await call('GET', '/api/v1/cluster/wait-ready?timeoutMs=1')).out.status).toBe(408);
    expect((await call('GET', '/api/v1/traffic/status')).out.status).toBe(200);
    await call('POST', '/api/v1/traffic/drain'); expect(drained).toBe(true);
    await call('POST', '/api/v1/traffic/undrain'); expect(drained).toBe(false);
    expect((await call('GET', '/api/v1/accounts')).out.status).toBe(200);
    expect((await call('POST', '/api/v1/accounts/export')).out.status).toBe(200);
    expect((await call('POST', '/api/v1/accounts/import', { confirm: true, accounts: [{ user: 'app', grants: ['GRANT USAGE ON *.* TO `app`@`%`'] }] })).out.status).toBe(200);
    expect(queries.length).toBeGreaterThan(5);
  });
  test('rejects missing auth and unsafe mutations', async () => {
    const api = createControlApi({ db: { query: async () => [[]] }, getStatus: async () => ({ ready: true, values: {} }), getTraffic: () => ({}), setDrain: () => {}, environment: { ROOT_TOKEN: 'root_token_here', GALERA: '0' }, log: { error: jest.fn() } });
    const unauth = response(); await api.handler(request('GET', '/api/v1/status', undefined, null), unauth); expect(unauth.status).toBe(401);
    const noConfirm = response(); await api.handler(request('POST', '/api/v1/cluster/bootstrap', {}), noConfirm); expect(noConfirm.status).toBe(409);
    const badGrant = response(); await api.handler(request('POST', '/api/v1/accounts/import', { confirm: true, accounts: [{ user: 'bad name', grants: [] }] }), badGrant); expect(badGrant.status).toBe(400);
    const missingLease = response(); await api.handler(request('POST', '/api/v1/credentials/lease', { database: 'app', identity: 'runtime' }), missingLease); expect(missingLease.status).toBe(501);
    const invalidLease = response(); await api.handler(request('POST', '/api/v1/credentials/lease', { database: 'app', identity: 'runtime', routes: ['unknown'] }), invalidLease); expect(invalidLease.status).toBe(400);
  });
  test('translates route failures and rejects unavailable bootstrap', async () => {
    const api = createControlApi({ db: { query: async () => [[]] }, getStatus: async () => { throw new Error('status unavailable'); }, getTraffic: () => ({}), setDrain: () => {}, environment: { ROOT_TOKEN: 'root_token_here', GALERA: '0' }, log: { error: jest.fn() }, dataDir: 'C:\\missing' });
    const out = response(); await api.handler(request('GET', '/api/v1/cluster/status'), out); expect(out.status).toBe(500);
    const noBootstrap = createControlApi({ db: { query: async () => [[]] }, getStatus: async () => ({ ready: false }), getTraffic: () => ({}), setDrain: () => {}, environment: { ROOT_TOKEN: 'root_token_here', GALERA: '1' }, log: { error: jest.fn() } });
    const unavailable = response(); await noBootstrap.handler(request('POST', '/api/v1/cluster/bootstrap', { confirm: true }), unavailable); expect(unavailable.status).toBe(503);
  });
});
