import { describe, expect, test } from '@jest/globals';
import { loadSupervisorConfig, mariaDbArguments } from '../src/config.mjs';

describe('supervisor configuration', () => {
  test('loads defaults and standalone arguments', () => {
    const config = loadSupervisorConfig({});
    expect(config.httpPort).toBe(8080);
    expect(mariaDbArguments(config)).not.toContain('--wsrep-on=ON');
  });
  test('adds Elera bootstrap arguments', () => {
    const config = loadSupervisorConfig({ ELERA: '1', ELERA_BOOTSTRAP: 'true', ELERA_CLUSTER_ADDRESS: 'gcomm://a,b' });
    expect(mariaDbArguments(config)).toEqual(expect.arrayContaining(['--wsrep-new-cluster', '--wsrep-cluster-address=gcomm://a,b']));
  });
  test('rejects invalid ports', () => { expect(() => loadSupervisorConfig({ ELERA_HTTP_PORT: '0' })).toThrow('ELERA_HTTP_PORT'); });
  test('uses Elera defaults when enabled without optional values', () => { const args = mariaDbArguments(loadSupervisorConfig({ ELERA: '1' })); expect(args).toEqual(expect.arrayContaining(['--wsrep-on=ON', '--wsrep-cluster-address=gcomm://', '--wsrep-node-address=127.0.0.1'])); });
  test('supports generated intent configuration', () => { expect(mariaDbArguments({ ...loadSupervisorConfig({}), intentConfigPath: '/etc/elera/mariadb.cnf' })[0]).toBe('--defaults-extra-file=/etc/elera/mariadb.cnf'); });
});
