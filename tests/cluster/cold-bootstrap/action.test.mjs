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
