import { expect, test } from '@jest/globals';
import { startupArguments } from '../../../src/cluster/cold-bootstrap/startup-arguments.mjs';

test('recovery bootstrap replaces any stale bootstrap flag with one explicit flag', () => {
  const args = ['--datadir=/data', '--wsrep-new-cluster', '--user=mysql'];
  expect(startupArguments(args, { mode: 'bootstrap', localWinner: true })).toEqual(['--datadir=/data', '--user=mysql', '--wsrep-new-cluster']);
});

test('recovery join rewrites the cluster address without adding bootstrap authority', () => {
  const args = ['--datadir=/data', '--wsrep-cluster-address=gcomm://old'];
  expect(startupArguments(args, { mode: 'join' }, { joinAddress: 'peer.example.test:4567' })).toEqual(['--datadir=/data', '--wsrep-cluster-address=gcomm://peer.example.test:4567']);
});

test('non-authoritative decisions preserve the base arguments', () => {
  const args = ['--datadir=/data', '--user=mysql'];
  expect(startupArguments(args, { mode: 'blocked' })).toEqual(args);
});

test('rejects missing startup arguments or decisions', () => {
  expect(() => startupArguments(undefined, { mode: 'join' })).toThrow(TypeError);
  expect(() => startupArguments([], undefined)).toThrow(TypeError);
});

test('does not rewrite a join without a usable peer address', () => {
  const args = ['--wsrep-cluster-address=gcomm://old'];
  expect(startupArguments(args, { mode: 'join' })).toEqual(args);
  expect(startupArguments(args, { mode: 'join' }, { joinAddress: '' })).toEqual(args);
});

test('preserves non-address join arguments while rewriting only the cluster address', () => {
  expect(startupArguments(['--datadir=/data', '--user=mysql'], { mode: 'join' }, { joinAddress: 'peer.example.test:4567' })).toEqual(['--datadir=/data', '--user=mysql']);
});
