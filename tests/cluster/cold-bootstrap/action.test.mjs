import { expect, jest, test } from '@jest/globals';
import { createColdBootstrapAction } from '../../../src/cluster/cold-bootstrap/action.mjs';

test('requires action dependencies', () => {
  expect(() => createColdBootstrapAction({})).toThrow('cold bootstrap action dependencies are required');
});

test('restarts an existing member with explicit new-cluster arguments', async () => {
  const processController = { stop: jest.fn(async () => {}), start: jest.fn(async () => {}) };
  const action = createColdBootstrapAction({ processController, args: ['--datadir=/var/lib/mysql', '--wsrep-new-cluster'], timeoutMs: 10 });
  await action();
  expect(processController.stop).toHaveBeenCalledWith(10);
  expect(processController.start).toHaveBeenCalledWith(['--datadir=/var/lib/mysql', '--wsrep-new-cluster']);
});
test('rejects a concurrent cold bootstrap and restores busy state', async () => {
  const setBusy = jest.fn();
  const action = createColdBootstrapAction({ processController: { stop: jest.fn(), start: jest.fn() }, args: [], timeoutMs: 1, isBusy: () => true, setBusy });
  await expect(action()).rejects.toMatchObject({ statusCode: 409 });
  expect(setBusy).not.toHaveBeenCalled();
});

test('validates timeout and normalizes every bootstrap flag variant', async () => {
  expect(() => createColdBootstrapAction({ processController: { stop: jest.fn(), start: jest.fn() }, args: [], timeoutMs: 0 })).toThrow('dependencies');
  const processController = { stop: jest.fn(async () => {}), start: jest.fn(async () => {}) };
  const action = createColdBootstrapAction({ processController, args: ['--wsrep-new-cluster=1', '--wsrep-new-cluster', '--datadir=/data'], timeoutMs: 5 });
  await action();
  expect(processController.start).toHaveBeenCalledWith(['--datadir=/data', '--wsrep-new-cluster']);
});

test('prevents a second invocation while the first bootstrap is running', async () => {
  let release; const stop = jest.fn(() => new Promise((resolve) => { release = resolve; }));
  const action = createColdBootstrapAction({ processController: { stop, start: jest.fn() }, args: [], timeoutMs: 5 });
  const first = action();
  await expect(action()).rejects.toMatchObject({ statusCode: 409 });
  release(); await first;
});
