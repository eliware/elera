import { clientSqlAddress, nodeAddress } from '../../src/routing/client-address.mjs';

test('uses the machine FQDN for Elera client routes', () => {
  const resolve = () => 'elera-0.cluster.local.elera-headless.elera.svc.cluster.local\n';
  expect(clientSqlAddress({ ELERA_CLUSTER_MODE: '1', ELERA_NODE_ADDRESS: '10.244.0.1' }, resolve)).toBe('elera-0.cluster.local.elera-headless.elera.svc.cluster.local');
  expect(clientSqlAddress({ ELERA_CLUSTER_MODE: '1', ELERA_NODE_ADDRESS: '10.244.0.1' }, resolve)).toBe('elera-0.cluster.local.elera-headless.elera.svc.cluster.local');
});

test('falls back to the node address when FQDN discovery fails', () => {
  expect(clientSqlAddress({}, () => { throw new Error('unavailable'); }, () => 'node.local')).toBe('node.local');
  expect(clientSqlAddress({}, () => '  ', () => 'node.local')).toBe('node.local');
  expect(clientSqlAddress({ ELERA_CLUSTER_MODE: '1' }, () => '  ', () => '')).toBe('127.0.0.1');
  expect(clientSqlAddress({}, () => 'elera.local')).toBe('elera.local');
  expect(clientSqlAddress({}, () => 'node.local')).toBe('node.local');
  expect(clientSqlAddress({}, () => { throw new Error('unavailable'); }, () => '127.0.0.1')).toBe('127.0.0.1');
});

test('derives the Galera address from hostname -i once', () => {
  expect(typeof nodeAddress({})).toBe('string');
  let calls = 0;
  const resolve = () => { calls += 1; return '10.244.3.103'; };
  expect(nodeAddress({ ELERA_CLUSTER_MODE: '1' }, resolve)).toBe('10.244.3.103');
  expect(nodeAddress({ ELERA_CLUSTER_MODE: '1' }, resolve)).toBe('10.244.3.103');
  expect(calls).toBe(1);
});

test('falls back to loopback when hostname -i is unavailable or empty', () => {
  const unavailable = () => { throw new Error('unavailable'); };
  expect(nodeAddress({ ELERA_CLUSTER_MODE: '1' }, unavailable)).toBe('127.0.0.1');
  expect(nodeAddress({ ELERA_CLUSTER_MODE: '1' }, () => '')).toBe('127.0.0.1');
});

test('exercises uncached resolver failures and empty results independently', () => {
  const failingFqdn = () => { throw new Error('dns unavailable'); };
  const emptyFqdn = () => ' ';
  const failingIp = () => { throw new Error('ip unavailable'); };
  expect(clientSqlAddress({}, failingFqdn, failingIp)).toBe('127.0.0.1');
  expect(clientSqlAddress({}, emptyFqdn, () => '10.0.0.8')).toBe('10.0.0.8');
  expect(nodeAddress({}, () => '')).toBe('127.0.0.1');
});

test('uses the platform hostname resolver when no IP resolver is injected', () => {
  expect(typeof clientSqlAddress({}, () => ' ', undefined)).toBe('string');
  expect(typeof clientSqlAddress()).toBe('string');
});
