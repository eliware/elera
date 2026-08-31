import { expect, jest, test } from '@jest/globals';
import { authorizeSupervisorRecovery } from '../../src/runtime/recovery-authorization.mjs';
import { startAuthorizedRecoveryProcess } from '../../src/runtime/recovery-process-start.mjs';

test('starts only the local authorized recovery winner with bootstrap arguments', async () => {
  const start = jest.fn().mockResolvedValue(undefined);
  const recoveryState = { set: jest.fn() };
  const onRecoveryBootstrap = jest.fn();
  await expect(startAuthorizedRecoveryProcess({ identity: { name: 'a' }, args: ['--datadir=/data'], bootstrap: { epoch: 'e', winner: { node: 'a' } }, mariaProcess: { start }, recoveryState, onRecoveryBootstrap })).resolves.toBe(true);
  expect(start).toHaveBeenCalledWith(['--datadir=/data', '--wsrep-new-cluster']);
  expect(onRecoveryBootstrap).not.toHaveBeenCalled();
  expect(recoveryState.set).toHaveBeenCalledWith('bootstrapping', expect.any(Object));
});

test('refuses recovery launch when a MariaDB child is already running', async () => {
  await expect(startAuthorizedRecoveryProcess({ identity: { name: 'a' }, args: [], bootstrap: { winner: { node: 'a' } }, mariaProcess: { child: { exitCode: null }, start: jest.fn() }, recoveryState: { set: jest.fn() } })).rejects.toMatchObject({ code: 'RECOVERY_PROCESS_ALREADY_RUNNING', statusCode: 409 });
});

test('does not start a non-winning node and reports the bootstrap decision', async () => {
  const onRecoveryBootstrap = jest.fn().mockResolvedValue('ignored');
  const start = jest.fn();
  await expect(startAuthorizedRecoveryProcess({ identity: { name: 'b' }, args: [], bootstrap: { winner: { node: 'a' } }, mariaProcess: { start }, recoveryState: { set: jest.fn() }, onRecoveryBootstrap })).resolves.toBe(false);
  expect(start).not.toHaveBeenCalled();
  expect(onRecoveryBootstrap).toHaveBeenCalled();
});

test('refuses a local bootstrap when launch arguments are unavailable', async () => {
  await expect(startAuthorizedRecoveryProcess({ identity: { name: 'a' }, bootstrap: { winner: { node: 'a' } }, mariaProcess: { start: jest.fn() }, recoveryState: { set: jest.fn() } })).rejects.toThrow('arguments are unavailable');
});

test('accepts an injected startup-argument builder for authorized recovery', async () => {
  const startupArgs = jest.fn(() => ['--recovered']);
  const start = jest.fn().mockResolvedValue(undefined);
  await expect(startAuthorizedRecoveryProcess({ identity: { name: 'a' }, args: ['--original'], bootstrap: { winner: { node: 'a' } }, mariaProcess: { start }, recoveryState: { set: jest.fn() }, startupArgs })).resolves.toBe(true);
  expect(startupArgs).toHaveBeenCalledWith(['--original'], { mode: 'bootstrap', localWinner: true });
  expect(start).toHaveBeenCalledWith(['--recovered']);
});

test('reports a rejected non-winning recovery handoff', async () => {
  const onRecoveryBootstrap = jest.fn().mockRejectedValue(new Error('handoff unavailable'));
  await expect(startAuthorizedRecoveryProcess({ identity: { name: 'b' }, args: [], bootstrap: { winner: { node: 'a' } }, mariaProcess: { start: jest.fn() }, recoveryState: { set: jest.fn() }, onRecoveryBootstrap })).rejects.toThrow('handoff unavailable');
});

test('uses the default non-winning recovery callback when omitted', async () => {
  await expect(startAuthorizedRecoveryProcess({ identity: { name: 'b' }, args: [], bootstrap: { winner: { node: 'a' } }, mariaProcess: { start: jest.fn() }, recoveryState: { set: jest.fn() } })).resolves.toBe(false);
});

const base = (fetchImpl) => ({ decision: { mode: 'bootstrap', localWinner: true, winner: 'a', epoch: 3, reason: 'winner' }, members: [{ name: 'a', local: true, url: 'http://a' }, { name: 'b', url: 'http://b' }, { name: 'c', url: 'http://c' }], config: { httpPort: 8080, timeoutMs: 10, dataDir: '/data' }, intentState: { paths: { renderedPath: '/state.cnf' } }, recoveryProtocol: { authorize: jest.fn(), beginBootstrap: jest.fn() }, recoveryState: { set: jest.fn() }, recoveryAudit: { lease: jest.fn(), authorization: jest.fn(), bootstrapStart: jest.fn() }, log: { warn: jest.fn() }, environment: { ROOT_TOKEN: 'root' }, fetchImpl, promote: jest.fn(), argumentsFor: jest.fn(() => ['--x']), applyArguments: jest.fn((args) => [...args, '--bootstrap']) });

test('authorizes winner after lease quorum and builds bootstrap args', async () => { const value = base(async () => ({ ok: true, json: async () => ({ data: { granted: true } }) })); const promote = jest.fn(); await expect(authorizeSupervisorRecovery({ ...value, pathExists: jest.fn().mockResolvedValue(undefined), promote })).resolves.toMatchObject({ args: ['--x', '--bootstrap'] }); expect(promote).toHaveBeenCalledWith('/data/grastate.dat'); expect(value.recoveryProtocol.authorize).toHaveBeenCalled(); expect(value.recoveryState.set).toHaveBeenCalledWith('recovery-authorized', expect.any(Object)); });
test('allows a fresh explicit bootstrap without grastate.dat', async () => { const value = base(async () => ({ ok: true, json: async () => ({ data: { granted: true } }) })); const pathExists = jest.fn().mockRejectedValue(Object.assign(new Error('missing'), { code: 'ENOENT' })); await expect(authorizeSupervisorRecovery({ ...value, pathExists })).resolves.toMatchObject({ args: ['--x', '--bootstrap'] }); expect(value.log.warn).not.toHaveBeenCalled(); });
test('fails closed for non-missing state-file errors', async () => { const value = base(async () => ({ ok: true, json: async () => ({ data: { granted: true } }) })); await expect(authorizeSupervisorRecovery({ ...value, pathExists: jest.fn().mockRejectedValue(new Error('permission denied')) })).rejects.toThrow('permission denied'); });
test('blocks winner when lease quorum is unavailable', async () => { const value = base(async () => ({ ok: false })); await expect(authorizeSupervisorRecovery(value)).resolves.toMatchObject({ decision: { mode: 'blocked' } }); expect(value.recoveryState.set).toHaveBeenCalledWith('blocked-ambiguous', expect.any(Object)); });
test('records a failed lease request as a denied claim', async () => { const value = base(async () => { throw new Error('peer unavailable'); }); await expect(authorizeSupervisorRecovery(value)).resolves.toMatchObject({ decision: { mode: 'blocked' } }); expect(value.recoveryAudit.lease).toHaveBeenCalledWith(expect.objectContaining({ granted: false })); });
test('does nothing for non-winner decisions', async () => { const value = base(jest.fn()); value.decision = { mode: 'join', localWinner: false }; await expect(authorizeSupervisorRecovery(value)).resolves.toEqual({ decision: value.decision, args: undefined }); expect(value.fetchImpl).not.toHaveBeenCalled(); });
test('blocks and audits authorization protocol failures', async () => { const value = base(async () => ({ ok: true, json: async () => ({ data: { granted: true } }) })); value.recoveryProtocol.authorize.mockRejectedValue(new Error('epoch changed')); value.recoveryAudit.failure = jest.fn(); value.log.error = jest.fn(); await expect(authorizeSupervisorRecovery(value)).resolves.toMatchObject({ decision: { mode: 'blocked', code: 'RECOVERY_AUTHORIZATION_FAILED' } }); expect(value.recoveryAudit.failure).toHaveBeenCalled(); expect(value.log.error).toHaveBeenCalled(); });
