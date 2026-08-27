import { describe, expect, test } from '@jest/globals';
import { loadSupervisorConfig, mariaDbArguments } from '../src/config.mjs';

describe('supervisor configuration', () => {
  test('loads defaults and standalone arguments', () => {
    const config = loadSupervisorConfig({});
    expect(config.httpPort).toBe(8080);
    expect(mariaDbArguments(config)).not.toContain('--wsrep-on=ON');
  });
  test('adds Galera bootstrap arguments', () => {
    const config = loadSupervisorConfig({ GALERA: '1', GALERA_BOOTSTRAP: 'true', GALERA_CLUSTER_ADDRESS: 'gcomm://a,b' });
    expect(mariaDbArguments(config)).toEqual(expect.arrayContaining(['--wsrep-new-cluster', '--wsrep-cluster-address=gcomm://a,b']));
  });
  test('rejects invalid ports', () => { expect(() => loadSupervisorConfig({ GALERA_HTTP_PORT: '0' })).toThrow('GALERA_HTTP_PORT'); });
  test('uses Galera defaults when enabled without optional values', () => { const args = mariaDbArguments(loadSupervisorConfig({ GALERA: '1' })); expect(args).toEqual(expect.arrayContaining(['--wsrep-on=ON', '--wsrep-cluster-address=gcomm://', '--wsrep-node-address=127.0.0.1'])); });
});
