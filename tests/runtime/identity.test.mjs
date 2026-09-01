import { expect, test } from '@jest/globals';
import { runtimeIdentity } from '../../src/runtime/identity.mjs';

test('uses only the supplied fully qualified hostname', () => {
  expect(runtimeIdentity({ hostname: () => 'node.cluster.local' })).toEqual({ name: 'node.cluster.local' });
});

test('rejects empty hostname output', () => {
  expect(() => runtimeIdentity({ hostname: () => '  ' })).toThrow('hostname -f returned an empty runtime identity');
});

test('rejects invalid short hostname output', () => {
  expect(() => runtimeIdentity({ hostname: () => 'node' })).toThrow('invalid fully qualified hostname');
});

test('propagates hostname command failure', () => {
  const failure = new Error('hostname unavailable');
  expect(() => runtimeIdentity({ hostname: () => { throw failure; } })).toThrow(failure);
});
