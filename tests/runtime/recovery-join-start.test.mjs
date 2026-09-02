import { expect, jest, test } from '@jest/globals';
import { startAuthorizedRecoveryJoin } from '../../src/runtime/recovery-join-start.mjs';

const base = () => ({ request: { winnerAddress: 'node-a.example.test', epoch: 4, clusterId: 'cluster-a', quorum: ['node-a.example.test', 'node-b.example.test'] }, identity: { name: 'node-b.example.test' }, args: ['--wsrep-cluster-address=gcomm://node-a.example.test,node-c.example.test'], mariaProcess: { start: jest.fn(async () => {}) }, recoveryState: { set: jest.fn() }, recoveryAudit: { joinStart: jest.fn() } });

test('starts a recovery join with the authorized winner address', async () => {
  const value = base();
  const startRuntime = jest.fn(async (options) => ({ options }));
  const result = await startAuthorizedRecoveryJoin({ ...value, startRuntime });
  expect(value.mariaProcess.start).toHaveBeenCalledWith(['--wsrep-cluster-address=gcomm://node-a.example.test']);
  expect(value.recoveryState.set).toHaveBeenCalledWith('joining', { reason: 'authorized recovery join', epoch: 4 });
  expect(startRuntime).toHaveBeenCalledWith(expect.objectContaining({ startupDecision: expect.objectContaining({ mode: 'join', bootstrapComplete: true }) }));
  expect(result).toMatchObject({ node: 'node-b.example.test', status: 'ready', epoch: 4 });
});

test('rejects joins without a winner address', async () => {
  await expect(startAuthorizedRecoveryJoin({ ...base(), request: { epoch: 4 }, startRuntime: jest.fn() })).rejects.toMatchObject({ code: 'RECOVERY_JOIN_WINNER_REQUIRED', statusCode: 409 });
});

test('rejects joins without startup arguments', async () => {
  await expect(startAuthorizedRecoveryJoin({ ...base(), args: undefined })).rejects.toThrow('recovery join arguments are unavailable');
});

test('rejects a join while MariaDB is already running', async () => {
  await expect(startAuthorizedRecoveryJoin({ ...base(), mariaProcess: { child: { exitCode: null }, start: jest.fn() } })).rejects.toMatchObject({ code: 'RECOVERY_PROCESS_ALREADY_RUNNING' });
});

test('returns joining status when runtime startup is not supplied', async () => {
  const value = base();
  await expect(startAuthorizedRecoveryJoin(value)).resolves.toMatchObject({ status: 'joining' });
});

test('refuses a join when runtime reports not ready', async () => {
  const value = base();
  await expect(startAuthorizedRecoveryJoin({ ...value, startRuntime: jest.fn(async () => ({ sqlReady: false })) })).rejects.toMatchObject({ code: 'JOINER_NOT_READY', statusCode: 409 });
});
