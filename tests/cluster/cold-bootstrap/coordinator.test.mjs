import { expect, jest, test } from '@jest/globals';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createColdBootstrapCoordinator } from '../../../src/cluster/cold-bootstrap/coordinator.mjs';

test('coordinates local and remote evidence and invokes the selected bootstrapper', async () => {
  const local = jest.fn(async () => ({ state: { uuid: 'u', seqno: 10 }, active: false }));
  const remote = jest.fn(async () => ({ state: { uuid: 'r', seqno: 9 }, active: false }));
  const bootstrapLocal = jest.fn(async () => {});
  const bootstrapRemote = jest.fn(async () => {});
  const coordinator = createColdBootstrapCoordinator({ nodes: [{ name: 'one', local: true }, { name: 'two', url: 'http://two' }], local, remote, bootstrapLocal, bootstrapRemote });
  const plan = await coordinator.plan();
  expect(plan).toBeDefined(); expect(local).toHaveBeenCalled(); expect(remote).toHaveBeenCalledWith('http://two');
});

test('requires coordinator dependencies', () => {
  expect(() => createColdBootstrapCoordinator()).toThrow('dependencies');
});

test('executes the selected local candidate and revalidates its evidence', async () => {
  const local = jest.fn(async () => ({ state: { uuid: 'u', seqno: 10, safeToBootstrap: true }, active: false }));
  const remote = jest.fn(async () => ({ state: { uuid: 'u', seqno: 9, safeToBootstrap: false }, active: false }));
  const bootstrapLocal = jest.fn(async () => {});
  const coordinator = createColdBootstrapCoordinator({ nodes: [{ name: 'one', local: true }], local, remote, bootstrapLocal });
  await expect(coordinator.execute({ confirm: true, idempotencyKey: 'local-1' })).resolves.toMatchObject({ eligible: true, candidate: { node: 'one', uuid: 'u', seqno: 10 } });
  expect(bootstrapLocal).toHaveBeenCalledTimes(1);
  expect(await coordinator.execute({ confirm: true, idempotencyKey: 'local-1' })).toMatchObject({ candidate: { node: 'one' } });
});

test('uses the remote bootstrapper for a remote candidate', async () => {
  const remote = jest.fn(async (url) => url === 'http://two' ? { state: { uuid: 'u', seqno: 10, safeToBootstrap: true }, active: false } : { state: { uuid: 'u', seqno: 9, safeToBootstrap: false }, active: false });
  const bootstrapRemote = jest.fn(async () => {});
  const coordinator = createColdBootstrapCoordinator({ nodes: [{ name: 'one', local: true }, { name: 'two', url: 'http://two' }], local: remote, remote, bootstrapLocal: jest.fn(), bootstrapRemote });
  await expect(coordinator.execute({ confirm: true })).resolves.toMatchObject({ candidate: { node: 'two' } });
  expect(bootstrapRemote).toHaveBeenCalledWith(expect.objectContaining({ name: 'two', url: 'http://two' }));
});

test('refuses remote execution when no remote bootstrapper is configured', async () => {
  const evidence = async () => ({ state: { uuid: 'u', seqno: 10, safeToBootstrap: true }, active: false });
  const coordinator = createColdBootstrapCoordinator({ nodes: [{ name: 'remote', url: 'http://remote' }], local: evidence, remote: evidence, bootstrapLocal: jest.fn() });
  await expect(coordinator.execute({ confirm: true })).rejects.toMatchObject({ statusCode: 503 });
});

test('recovers a missing sequence number through the local evidence reader', async () => {
  const local = jest.fn(async () => ({ state: { uuid: 'u', seqno: -1, safeToBootstrap: true }, active: false }));
  const coordinator = createColdBootstrapCoordinator({ nodes: [{ name: 'one', local: true, dataDir: '/data' }], local, remote: jest.fn(), bootstrapLocal: jest.fn() });
  await expect(coordinator.plan()).resolves.toMatchObject({ eligible: true, candidate: { node: 'one', seqno: -1 } });
});

test('persists an idempotent local bootstrap result when a lock path is configured', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'elera-coordinator-'));
  try {
    const local = jest.fn(async () => ({ state: { uuid: 'u', seqno: 4, safeToBootstrap: true }, active: false }));
    const bootstrapLocal = jest.fn(async () => undefined);
    const coordinator = createColdBootstrapCoordinator({ nodes: [{ name: 'one', local: true }], local, remote: jest.fn(), bootstrapLocal, lockPath: join(directory, 'lock') });
    await coordinator.execute({ confirm: true, idempotencyKey: 'one' });
    await coordinator.execute({ confirm: true, idempotencyKey: 'one' });
    expect(bootstrapLocal).toHaveBeenCalledTimes(1);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('dispatches a verified local candidate to the local bootstrap callback', async () => {
  const bootstrapLocal = jest.fn(async () => undefined);
  const coordinator = createColdBootstrapCoordinator({
    nodes: [{ name: 'local', local: true }],
    local: async () => ({ state: { uuid: 'u', seqno: 8, safeToBootstrap: true }, active: false }),
    remote: jest.fn(),
    bootstrapLocal,
  });
  await coordinator.execute({ confirm: true });
  expect(bootstrapLocal).toHaveBeenCalledTimes(1);
});

test('dispatches a verified remote candidate to the remote bootstrap callback', async () => {
  const bootstrapRemote = jest.fn(async () => undefined);
  const coordinator = createColdBootstrapCoordinator({
    nodes: [{ name: 'remote', url: 'http://remote' }],
    local: async () => ({ state: { uuid: 'u', seqno: 1, safeToBootstrap: false }, active: false }),
    remote: async () => ({ state: { uuid: 'u', seqno: 9, safeToBootstrap: true }, active: false }),
    bootstrapLocal: jest.fn(),
    bootstrapRemote,
  });
  await coordinator.execute({ confirm: true });
  expect(bootstrapRemote).toHaveBeenCalledWith({ name: 'remote', url: 'http://remote' });
});
