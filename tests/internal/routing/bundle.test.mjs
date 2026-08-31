import { expect, test } from '@jest/globals';
import { createSupervisorBundle, validateSupervisorBundle } from '../../../src/internal/routing/bundle.mjs';

const routes = {
  primary: [{ host: 'elera-0', port: 3306 }],
  balanced: [{ host: 'elera-1', port: 3306, weight: 1 }],
};

test('builds a normalized supervisor bundle', () => {
  const bundle = createSupervisorBundle({
    application: 'billing',
    database: 'billing_db',
    identity: 'writer',
    username: 'billing_writer',
    password: 'secret',
    routes,
    expiresAt: '2099-01-01T00:00:00Z',
    nodeIdentity: { name: 'elera-0' },
    ports: { sql: 3306, http: 8080 },
  });

  expect(bundle).toMatchObject({ apiVersion: 'v1', application: 'billing', database: 'billing_db', identity: 'writer', bundleVersion: 1, nodeIdentity: 'elera-0', ports: { sql: 3306, http: 8080 } });
  expect(bundle.routes.primary[0].nodeId).toBe('elera-0');
  expect(bundle.routes.balanced[0].nodeId).toBe('elera-1');
  expect(bundle.writer).toEqual(bundle.routes.primary[0]);
  expect(bundle.failover).toEqual([]);
  expect(bundle.readers).toEqual(bundle.routes.balanced);
});

test('preserves the physical database for the SQL connection separately from the logical name', () => {
  const bundle = createSupervisorBundle({ application: 'app', database: 'logical_db', physicalDatabase: 'elera_db_42', identity: 'runtime', username: 'u', password: 'p', routes: { primary: [{ host: 'node', port: 3306 }], balanced: [{ host: 'node', port: 3306 }] }, expiresAt: '2099-01-01', ports: { sql: 3306, http: 8080 } });
  expect(bundle).toMatchObject({ database: 'logical_db', physicalDatabase: 'elera_db_42' });
});

test('omits an explicitly empty physical database', () => {
  expect(() => createSupervisorBundle({ application: 'app', database: 'logical_db', physicalDatabase: null, identity: 'runtime', username: 'u', password: 'p', routes: { primary: [{ host: 'node', port: 3306 }], balanced: [{ host: 'node', port: 3306 }] }, expiresAt: '2099-01-01', ports: { sql: 3306, http: 8080 } })).toThrow('physicalDatabase is required');
});

test('preserves explicit assignments and metadata', () => {
  const writer = { host: 'writer', port: 3306, nodeId: 'node-w' };
  const failover = [{ host: 'backup', port: 3306, nodeId: 'node-b' }];
  const bundle = createSupervisorBundle({
    application: 'app', database: 'db', identity: 'id', username: 'u', password: 'p', routes,
    writer, failover, readers: [writer], bundleVersion: 4, refreshAfter: '2098-01-01T00:00:00Z',
    expiresAt: '2099-01-01T00:00:00Z', nodeIdentity: { name: 'node-w' }, ports: { sql: 3306, http: 8080 },
  });

  expect(bundle.writer).toBe(writer);
  expect(bundle.failover).toBe(failover);
  expect(bundle.readers).toEqual([writer]);
  expect(bundle.bundleVersion).toBe(4);
  expect(bundle.refreshAfter).toBe('2098-01-01T00:00:00Z');
});

test('derives route node ids and the default supervisor identity', () => {
  const bundle = createSupervisorBundle({ database: 'db', identity: 'id', username: 'u', password: 'p', routes: { primary: [{ host: 'node', port: 3306 }], balanced: [{ host: 'node', port: 3306 }] }, expiresAt: '2099-01-01', nodeIdentity: { name: 'supervisor' }, ports: { sql: 3306, http: 8080 } });
  expect(bundle.routes.primary[0].nodeId).toBe('node');
  expect(bundle.nodeIdentity).toBe('supervisor');
  const omitted = createSupervisorBundle({ database: 'db', identity: 'id', username: 'u', password: 'p', routes: { primary: [{ host: 'node', port: 3306 }], balanced: [{ host: 'node', port: 3306 }] }, expiresAt: '2099-01-01', ports: { sql: 3306, http: 8080 } });
  expect(omitted.nodeIdentity).toBe('supervisor');
  const named = createSupervisorBundle({ database: 'db', identity: 'id', username: 'u', password: 'p', routes: { primary: [{ host: 'node', port: 3306 }], balanced: [{ host: 'node', port: 3306 }] }, expiresAt: '2099-01-01', nodeIdentity: 'named', ports: { sql: 3306, http: 8080 } });
  expect(named.nodeIdentity).toBe('named');
});

test('rejects missing identity, expiry, routes, and invalid route nodes', () => {
  expect(() => createSupervisorBundle({ database: 'db', identity: 'id', username: 'u', password: 'p', expiresAt: '2099-01-01' })).toThrow('route primary and balanced');
  expect(() => validateSupervisorBundle(null)).toThrow('required');
  const valid = { apiVersion: 'v1', application: 'app', database: 'db', physicalDatabase: 'elera_db_1', identity: 'id', credentials: { username: 'u', password: 'p' }, writer: { host: 'node', port: 3306, nodeId: 'node' }, readers: [{ host: 'node', port: 3306, nodeId: 'node' }], failover: [], bundleVersion: 1, expiresAt: '2099-01-01', nodeIdentity: 'node', ports: { sql: 3306, http: 8080 }, routes };
  expect(() => validateSupervisorBundle({ ...valid, identity: undefined })).toThrow('identity');
  expect(() => validateSupervisorBundle({ ...valid, expiresAt: undefined })).toThrow('expiresAt');
  expect(() => validateSupervisorBundle({ ...valid, routes: { primary: {} } })).toThrow('routes.primary');
  expect(() => validateSupervisorBundle({ ...valid, routes: { primary: [{ host: '', port: 3306 }], balanced: [] } })).toThrow();
  expect(() => validateSupervisorBundle({ ...valid, routes: { primary: [], balanced: [{ host: 'node', port: 0 }] } })).toThrow();
});

test('rejects a null supervisor identity instead of manufacturing one', () => {
  expect(() => createSupervisorBundle({ database: 'db', identity: 'id', username: 'u', password: 'p', routes, expiresAt: '2099-01-01', nodeIdentity: null })).toThrow();
});

test('rejects a bundle when no primary route or writer exists', () => {
  expect(() => createSupervisorBundle({ database: 'db', identity: 'id', username: 'u', password: 'p', routes: { primary: [], balanced: [{ host: 'reader', port: 3306 }] }, ports: { sql: 3306, http: 8080 }, expiresAt: '2099-01-01' })).toThrow('writer host is required');
});

test('rejects malformed route collections and weights', () => {
  const valid = { apiVersion: 'v1', application: 'app', database: 'db', physicalDatabase: 'elera_db_1', identity: 'id', credentials: { username: 'u', password: 'p' }, writer: { host: 'node', port: 3306, nodeId: 'node' }, readers: [{ host: 'node', port: 3306, nodeId: 'node' }], failover: [], bundleVersion: 1, expiresAt: '2099-01-01', nodeIdentity: 'node', ports: { sql: 3306, http: 8080 }, routes };
  expect(() => validateSupervisorBundle({ ...valid, routes: { primary: {}, balanced: [] } })).toThrow('routes.primary');
  expect(() => validateSupervisorBundle({ ...valid, routes: { primary: [], balanced: [{ host: 'node', port: 3306, weight: -1 }] } })).toThrow('weight');
});
