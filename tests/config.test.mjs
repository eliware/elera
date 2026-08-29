import { describe, expect, test } from '@jest/globals';
import { loadSupervisorConfig, mariaDbArguments } from '../src/config.mjs';

describe('supervisor configuration', () => {
  test('loads defaults and standalone arguments', () => {
    const config = loadSupervisorConfig({});
    expect(config.httpPort).toBe(8080);
    expect(mariaDbArguments(config)).not.toContain('--wsrep-on=ON');
  });
  test('adds Elera bootstrap arguments', () => {
    const intent = { apiVersion: 'elera.eliware.dev/v1alpha1', kind: 'SupervisorIntent', cluster: { name: 'c', members: [{ name: 'n', address: 'a' }, { name: 'p', address: 'b' }] }, mariadb: { port: 3306 }, routing: { healthIntervalMs: 1000 }, drain: { queryTimeoutMs: 1 } };
    const config = loadSupervisorConfig({ ELERA_CLUSTER_BOOTSTRAP: 'true' }, intent);
    expect(mariaDbArguments(config)).toEqual(expect.arrayContaining(['--wsrep-new-cluster', '--wsrep-cluster-address=gcomm://a,b']));
  });
  test('adds one-shot cluster bootstrap without changing data initialization mode', () => {
    const config = loadSupervisorConfig({ ELERA_CLUSTER_BOOTSTRAP: 'true' }, { apiVersion: 'elera.eliware.dev/v1alpha1', kind: 'SupervisorIntent', cluster: { name: 'c', members: [{ name: 'n', address: 'a' }, { name: 'p', address: 'b' }] }, mariadb: { port: 3306 }, routing: { healthIntervalMs: 1000 }, drain: { queryTimeoutMs: 1 } });
    expect(mariaDbArguments(config)).toContain('--wsrep-new-cluster');
  });
  test('rejects invalid ports', () => { expect(() => loadSupervisorConfig({ ELERA_HTTP_PORT: '0' })).toThrow('ELERA_HTTP_PORT'); });
  test('uses the persisted Galera node address', () => { const intent = { apiVersion: 'elera.eliware.dev/v1alpha1', kind: 'SupervisorIntent', cluster: { name: 'c', members: [{ name: 'n', address: '10.244.0.1' }, { name: 'p', address: 'peer' }] }, mariadb: { port: 3306 }, routing: { healthIntervalMs: 1000 }, drain: { queryTimeoutMs: 1 } }; const args = mariaDbArguments(loadSupervisorConfig({}, intent)); expect(args).toEqual(expect.arrayContaining(['--wsrep-on=ON', '--wsrep-node-address=10.244.0.1'])); });
  test('disables provider auto-recovery so the supervisor owns cold bootstrap authority', () => { const intent = { apiVersion: 'elera.eliware.dev/v1alpha1', kind: 'SupervisorIntent', cluster: { name: 'c', members: [{ name: 'n', address: 'n' }, { name: 'p', address: 'p' }] }, mariadb: { port: 3306 }, routing: { healthIntervalMs: 1000 }, drain: { queryTimeoutMs: 1 } }; expect(mariaDbArguments(loadSupervisorConfig({}, intent))).toContain('--wsrep-provider-options=pc.recovery=FALSE'); });
  test('supports generated intent configuration', () => { expect(mariaDbArguments({ ...loadSupervisorConfig({}), intentConfigPath: '/etc/elera/mariadb.cnf' })[0]).toBe('--defaults-extra-file=/etc/elera/mariadb.cnf'); });
  test('uses explicit runtime settings and persisted intent fields', () => { const intent = { cluster: { members: [{ name: 'node', address: '10.0.0.1' }] }, mariadb: { dataDir: '/data' } }; const config = loadSupervisorConfig({ ELERA_HTTP_PORT: '8081', ELERA_QUERY_TIMEOUT_MS: '7', MARIADB_DATA_DIR: '/fallback', RUNTIME_NODE_NAME: 'node' }, intent); expect(config.clusterSize).toBe(1); expect(config.dataDir).toBe('/data'); expect(config.timeoutMs).toBe(7); });
  test('uses environment data directory when intent omits it', () => { const config = loadSupervisorConfig({ MARIADB_DATA_DIR: '/fallback', RUNTIME_NODE_NAME: 'node' }, { mariadb: {}, cluster: {} }); expect(config.dataDir).toBe('/fallback'); expect(config.clusterSize).toBe(1); });
});
