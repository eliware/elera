import { describe, expect, test } from '@jest/globals';
import { loadSupervisorConfig, mariaDbArguments } from '../src/config.mjs';

describe('supervisor configuration', () => {
  test('loads defaults and standalone arguments', () => {
    const config = loadSupervisorConfig({}, undefined, { name: 'node.example.test' });
    expect(config.httpPort).toBe(8080);
    expect(mariaDbArguments(config)).not.toContain('--wsrep-on=ON');
  });
  test('does not derive bootstrap authority from ambient environment', () => {
    const intent = { apiVersion: 'elera.eliware.dev/v1alpha1', kind: 'SupervisorIntent', cluster: { name: 'c', members: [{ name: 'n.example.test', address: 'n.example.test' }, { name: 'p.example.test', address: 'b.example.test' }] }, mariadb: { port: 3306 }, routing: { healthIntervalMs: 1000 }, drain: { queryTimeoutMs: 1 } };
    const config = loadSupervisorConfig({ ELERA_CLUSTER_BOOTSTRAP: 'true' }, intent, { name: 'n.example.test' });
    expect(mariaDbArguments(config)).not.toContain('--wsrep-new-cluster');
    expect(mariaDbArguments(config)).toContain('--wsrep-cluster-address=gcomm://n.example.test,b.example.test');
  });
  test('rejects invalid ports', () => { expect(() => loadSupervisorConfig({ ELERA_HTTP_PORT: '0' }, undefined, { name: 'node.example.test' })).toThrow('ELERA_HTTP_PORT'); });
  test('uses hostname -f for the Galera node address', () => { const intent = { apiVersion: 'elera.eliware.dev/v1alpha1', kind: 'SupervisorIntent', cluster: { name: 'c', members: [{ name: 'n.example.test', address: 'n.example.test' }, { name: 'p.example.test', address: 'peer.example.test' }] }, mariadb: { port: 3306 }, routing: { healthIntervalMs: 1000 }, drain: { queryTimeoutMs: 1 } }; const args = mariaDbArguments(loadSupervisorConfig({}, intent, { name: 'n.example.test' })); expect(args).toEqual(expect.arrayContaining(['--wsrep-on=ON', '--wsrep-node-address=n.example.test'])); });
  test('requires the direct shared identity when generating clustered arguments', () => { const config = { ...loadSupervisorConfig({}, { cluster: { members: [{ name: 'n', address: 'n' }, { name: 'p', address: 'p' }] }, mariadb: { port: 3306 } }, { name: 'n' }), runtimeIdentity: undefined }; expect(() => mariaDbArguments(config)).toThrow('runtime identity is required'); });
  test('leaves Galera provider recovery enabled for ordinary restarts', () => { const intent = { apiVersion: 'elera.eliware.dev/v1alpha1', cluster: { name: 'c', members: [{ name: 'n.example.test', address: 'n.example.test' }, { name: 'p.example.test', address: 'p.example.test' }] }, mariadb: { port: 3306 }, routing: { healthIntervalMs: 1000 }, drain: { queryTimeoutMs: 1 } }; expect(mariaDbArguments(loadSupervisorConfig({}, intent, { name: 'n.example.test' }))).toContain('--wsrep-provider-options=pc.recovery=TRUE'); });
  test('supports generated intent configuration', () => { expect(mariaDbArguments({ ...loadSupervisorConfig({}, undefined, { name: 'node.example.test' }), intentConfigPath: '/etc/elera/mariadb.cnf' })[0]).toBe('--defaults-extra-file=/etc/elera/mariadb.cnf'); });
  test('uses explicit runtime settings and persisted intent fields', () => { const intent = { cluster: { members: [{ name: 'node.example.test', address: 'node.example.test' }] }, mariadb: { dataDir: '/data' } }; const config = loadSupervisorConfig({ ELERA_HTTP_PORT: '8081', ELERA_QUERY_TIMEOUT_MS: '7', MARIADB_DATA_DIR: '/fallback' }, intent, { name: 'node.example.test' }); expect(config.clusterSize).toBe(1); expect(config.dataDir).toBe('/data'); expect(config.timeoutMs).toBe(7); });
  test('uses environment data directory when intent omits it', () => { const config = loadSupervisorConfig({ MARIADB_DATA_DIR: '/fallback' }, { mariadb: {}, cluster: {} }, { name: 'node.example.test' }); expect(config.dataDir).toBe('/fallback'); expect(config.clusterSize).toBe(1); });
});
