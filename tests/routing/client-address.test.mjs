import { clientSqlAddress, nodeAddress } from '../../src/routing/client-address.mjs';

test('uses the machine FQDN for Elera client routes', () => {
  const resolve = () => 'elera-0.elera-headless.elera.svc.cluster.local\n';
  expect(clientSqlAddress({ ELERA: '1', ELERA_NODE_ADDRESS: '10.244.0.1' }, resolve)).toBe('elera-0.elera-headless.elera.svc.cluster.local');
  expect(clientSqlAddress({ ELERA: '1', ELERA_NODE_ADDRESS: '10.244.0.1' }, resolve)).toBe('elera-0.elera-headless.elera.svc.cluster.local');
});

test('falls back to the node address when FQDN discovery fails', () => {
  expect(clientSqlAddress({ ELERA: '1', ELERA_NODE_ADDRESS: 'node.local' }, () => { throw new Error('unavailable'); })).toBe('node.local');
  expect(clientSqlAddress({ ELERA: '1', ELERA_NODE_ADDRESS: 'node.local' }, () => '  ')).toBe('node.local');
  expect(clientSqlAddress({ ELERA: '1' }, () => '  ', () => '')).toBe('127.0.0.1');
  expect(clientSqlAddress({ ELERA: '0', ELERA_NODE_ADDRESS: 'node.local' }, () => 'elera.local')).toBe('node.local');
  expect(clientSqlAddress({ ELERA_NODE_ADDRESS: 'node.local' })).toBe('node.local');
  expect(clientSqlAddress({})).toBe('127.0.0.1');
});

test('derives the Galera address from hostname -i once', () => {
  let calls = 0;
  const resolve = () => { calls += 1; return '10.244.3.103'; };
  expect(nodeAddress({ ELERA: '1' }, resolve)).toBe('10.244.3.103');
  expect(nodeAddress({ ELERA: '1' }, resolve)).toBe('10.244.3.103');
  expect(calls).toBe(1);
});

test('falls back to loopback when hostname -i is unavailable or empty', () => {
  const unavailable = () => { throw new Error('unavailable'); };
  expect(nodeAddress({ ELERA: '1' }, unavailable)).toBe('127.0.0.1');
  expect(nodeAddress({ ELERA: '1' }, () => '')).toBe('127.0.0.1');
});
