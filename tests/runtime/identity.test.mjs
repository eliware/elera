import { expect, test } from '@jest/globals';
import { runtimeIdentity } from '../../src/runtime/identity.mjs';

test('derives hostname and first external IPv4 address', () => { expect(runtimeIdentity({ hostname: () => 'node', addresses: () => ({ eth0: [{ address: '10.0.0.1', family: 'IPv4', internal: false }] }) })).toEqual({ name: 'node', address: '10.0.0.1' }); });
test('uses loopback when no external IPv4 exists', () => { expect(runtimeIdentity({ hostname: () => 'node', addresses: () => ({ lo: [{ address: '127.0.0.1', family: 'IPv4', internal: true }] }) })).toEqual({ name: 'node', address: '127.0.0.1' }); });
test('uses the fully qualified hostname supplied by the runtime', () => { expect(runtimeIdentity({ hostname: () => 'elera-1.cluster.local', addresses: () => ({ eth0: [{ address: '10.0.0.1', family: 'IPv4', internal: false }] }) })).toEqual({ name: 'elera-1.cluster.local', address: '10.0.0.1' }); });
test('skips non-IPv4 and missing interface entries before selecting an address', () => {
  expect(runtimeIdentity({ hostname: () => 'node', addresses: () => ({ eth0: [null, { address: '::1', family: 'IPv6', internal: false }, { address: '10.0.0.2', family: 'IPv4', internal: false }] }) })).toEqual({ name: 'node', address: '10.0.0.2' });
});
