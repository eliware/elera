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
  });
});
