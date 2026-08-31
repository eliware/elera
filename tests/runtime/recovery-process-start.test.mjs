import { expect, jest, test } from '@jest/globals';
import { startAuthorizedRecoveryProcess } from '../../src/runtime/recovery-process-start.mjs';

const base = () => ({ bootstrap: { epoch: 2, winner: { node: 'node-a' } }, identity: { name: 'node-a' }, args: ['--datadir=/data'], mariaProcess: { start: jest.fn(async () => {}) }, recoveryState: { set: jest.fn() } });

test('starts the authorized local winner with new-cluster arguments', async () => {
  const value = base();
  await expect(startAuthorizedRecoveryProcess(value)).resolves.toBe(true);
  expect(value.mariaProcess.start).toHaveBeenCalledWith(['--datadir=/data', '--wsrep-new-cluster']);
  expect(value.recoveryState.set).toHaveBeenCalledWith('bootstrapping', expect.any(Object));
});

test('hands a non-winning recovery decision back to the caller', async () => {
  const value = { ...base(), bootstrap: { epoch: 2, winner: { node: 'node-b' } } };
  const handoff = jest.fn(async () => false);
  await expect(startAuthorizedRecoveryProcess({ ...value, onRecoveryBootstrap: handoff })).resolves.toBe(false);
  expect(handoff).toHaveBeenCalledWith(value.bootstrap);
  expect(value.mariaProcess.start).not.toHaveBeenCalled();
});

test('rejects unavailable arguments and a running process', async () => {
  await expect(startAuthorizedRecoveryProcess({ ...base(), args: undefined })).rejects.toThrow('arguments are unavailable');
  await expect(startAuthorizedRecoveryProcess({ ...base(), mariaProcess: { child: { exitCode: null }, start: jest.fn() } })).rejects.toMatchObject({ code: 'RECOVERY_PROCESS_ALREADY_RUNNING', statusCode: 409 });
});
