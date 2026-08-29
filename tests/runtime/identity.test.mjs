import { expect, test } from '@jest/globals';
import { runtimeIdentity } from '../src/runtime/identity.mjs';

test('derives hostname and first external IPv4 address', () => { expect(runtimeIdentity({ hostname: () => 'node', addresses: () => ({ eth0: [{ address: '10.0.0.1', family: 'IPv4', internal: false }] }) })).toEqual({ name: 'node', address: '10.0.0.1' }); });
test('uses loopback when no external IPv4 exists', () => { expect(runtimeIdentity({ hostname: () => 'node', addresses: () => ({ lo: [{ address: '127.0.0.1', family: 'IPv4', internal: true }] }) })).toEqual({ name: 'node', address: '127.0.0.1' }); });
