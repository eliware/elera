import { expect, jest, test } from '@jest/globals';
import { createDrainManager } from '../src/lifecycle/drain-manager.mjs';
import { createDrainPropagation } from '../src/cluster/drain-propagation.mjs';

test('propagates drain and undrain to peers and avoids loops for propagated requests', async () => {
  const fetchImpl = jest.fn(async () => ({ ok: true, status: 200 }));
  const drain = createDrainManager();
  const cluster = createDrainPropagation({ drain, peers: ['http://one/', 'http://two'], token: 'secret', fetchImpl });
  cluster.set(true);
  await new Promise((resolve) => setImmediate(resolve));
  expect(fetchImpl).toHaveBeenCalledTimes(2);
  expect(fetchImpl.mock.calls[0][0]).toBe('http://one/api/v1/traffic/drain');
  expect(fetchImpl.mock.calls[0][1].headers).toMatchObject({ authorization: 'Bearer secret', 'x-elera-drain-propagated': 'true' });
  cluster.set(false, true);
  await new Promise((resolve) => setImmediate(resolve));
  expect(fetchImpl).toHaveBeenCalledTimes(2);
  expect(drain.isDraining()).toBe(false);
  cluster.set(false);
  await new Promise((resolve) => setImmediate(resolve));
  expect(fetchImpl).toHaveBeenCalledTimes(4);
});

test('logs unavailable peer propagation without failing the local transition', async () => {
  const log = { warn: jest.fn() };
  const drain = createDrainManager();
  const cluster = createDrainPropagation({ drain, peers: ['http://one'], token: 'secret', fetchImpl: jest.fn(async () => { throw new Error('offline'); }), log });
  cluster.set(true);
  await new Promise((resolve) => setImmediate(resolve));
  expect(drain.isDraining()).toBe(true);
  expect(log.warn).toHaveBeenCalledWith('Cluster drain propagation failed', expect.anything());
});

test('requires a drain manager and ignores empty peer entries', () => {
  expect(() => createDrainPropagation()).toThrow('drain manager is required');
  const drain = createDrainManager();
  const cluster = createDrainPropagation({ drain, peers: ['', null], token: undefined });
  expect(cluster.set(true)).toBe(true);
});

test('logs a non-successful peer response', async () => {
  const log = { warn: jest.fn() };
  const drain = createDrainManager();
  const cluster = createDrainPropagation({ drain, peers: ['http://one'], token: 'secret', fetchImpl: jest.fn(async () => ({ ok: false, status: 503 })), log });
  cluster.set(true);
  await new Promise((resolve) => setImmediate(resolve));
  expect(log.warn).toHaveBeenCalled();
});
