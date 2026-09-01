import { expect, jest, test } from '@jest/globals';

const captured = {};
const defaultResult = () => ({ initialIntent: { cluster: { members: [{ name: 'node-a' }, { name: 'node-b' }] } }, args: ['--datadir=/data'], localEvidence: { local: {} }, members: [{ name: 'node-a' }, { name: 'node-b' }], startupDecision: { mode: 'blocked', reason: 'all nodes require recovery' }, coldRecoveryProtocol: { complete: jest.fn() }, recoveryCompletion: {} });
let recoveryResult = defaultResult();
let runtimeFailure;
let processFailure;
jest.unstable_mockModule('../../src/runtime/startup-configuration.mjs', () => ({
  loadSupervisorStartupConfiguration: jest.fn(async () => ({ initialIntent: { cluster: { members: [{ name: 'node-a' }, { name: 'node-b' }] } }, args: ['--datadir=/data'] }))
}));
jest.unstable_mockModule('../../src/runtime/recovery-startup.mjs', () => ({
  prepareSupervisorRecovery: jest.fn(async () => recoveryResult)
}));
jest.unstable_mockModule('../../src/runtime/startup-services.mjs', () => ({ createSupervisorStartupServices: jest.fn((options) => { captured.startupServices = options; const processController = { start: jest.fn(async () => { if (processFailure) throw processFailure; }) }; captured.processController = processController; return { processController }; }) }));
jest.unstable_mockModule('../../src/runtime/cold-bootstrap-wiring.mjs', () => ({ createSupervisorColdBootstrap: jest.fn((options) => { captured.coldBootstrap = options; return {}; }) }));
jest.unstable_mockModule('../../src/runtime/maria-startup.mjs', () => ({ startSupervisorMariaDb: jest.fn() }));
jest.unstable_mockModule('../../src/runtime/runtime-start.mjs', () => ({ startSupervisorRuntime: jest.fn(async (options) => { captured.runtimeOptions = options; if (runtimeFailure) throw runtimeFailure; options.setDb?.({ connected: true }); return { db: { connected: true }, routingTimer: 'routing', peerTimer: 'peer' }; }) }));
jest.unstable_mockModule('../../src/lifecycle/data-directory.mjs', () => ({ inspectDataDirectory: jest.fn(() => ({ action: 'start' })) }));
jest.unstable_mockModule('../../src/lifecycle/pending-init/runtime.mjs', () => ({
  startPendingInitRuntime: jest.fn(async (options) => { captured.pending = options; captured.pendingRuntime = { shutdown: jest.fn() }; return captured.pendingRuntime; })
}));

const { startSupervisor } = await import('../../src/runtime/startup-coordinator.mjs');

function dependencies() {
  return {
    config: { elera: true, httpPort: 8080, dataDir: '/data' }, identity: { name: 'node-a' }, log: { info: jest.fn(), warn: jest.fn() },
    loadEnvironmentIntent: jest.fn(), intentState: { apply: jest.fn() }, routingEnvironment: {}, recoveryState: { set: jest.fn() }, recoveryAudit: {}, health: {},
    environment: { ROOT_TOKEN: 'root' }, dbEnv: {}, probes: {}, routingEvent: jest.fn(), routingBus: {}, sharedRoutingAssignments: {}, observationStore: {},
    getDrained: () => false, cleanRestartIntent: {}, telemetry: { start: jest.fn() }, state: { mariaProcess: {} }
  };
}

test('blocked initialized startup wires recovery readiness and completion handoffs', async () => {
  const onRecoveryComplete = jest.fn();
  await expect(startSupervisor({ ...dependencies(), onRecoveryComplete })).resolves.toEqual({ pending: true });
  expect(captured.pending.recoveryRequired).toBe(true);
  expect(captured.pending.recoveryProtocol).toBeDefined();
  expect(captured.pending.onRecoveryComplete).toBe(onRecoveryComplete);
  await captured.pending.onRecoveryBootstrap({ epoch: 7, winner: { node: 'node-a' }, clusterId: 'cluster-a', quorum: ['node-a', 'node-b'] });
  expect(captured.pending.recoveryProtocol.complete).not.toHaveBeenCalled();
  await captured.pending.onRecoveryComplete({ epoch: 7, phase: 'complete' });
  expect(onRecoveryComplete).toHaveBeenCalledWith({ epoch: 7, phase: 'complete' });
});

test('starts the local recovery winner and runtime after authorized bootstrap', async () => {
  recoveryResult = defaultResult();
  recoveryResult.startupServer = { close: jest.fn() };
  const state = { mariaProcess: {} };
  const recoverTraffic = jest.fn().mockResolvedValue(undefined);
  const result = await startSupervisor({ ...dependencies(), state, recoverTraffic });
  await captured.pending.onRecoveryBootstrap({ epoch: 8, winner: { node: 'node-a' }, clusterId: 'cluster-a', quorum: ['node-a', 'node-b'] });
  expect(captured.processController.start).toHaveBeenCalledWith(expect.arrayContaining(['--wsrep-new-cluster']));
  expect(captured.pendingRuntime.shutdown).toHaveBeenCalledTimes(1);
  expect(recoveryResult.startupServer.close).toHaveBeenCalledTimes(1);
  expect(recoverTraffic).toHaveBeenCalledTimes(1);
  await captured.pending.onRecoveryBootstrap({ epoch: 8, winner: { node: 'node-a' }, clusterId: 'cluster-a', quorum: ['node-a', 'node-b'] });
  expect(captured.pendingRuntime.shutdown).toHaveBeenCalledTimes(1);
  expect(recoveryResult.startupServer.close).toHaveBeenCalledTimes(1);
  expect(result).toEqual({ pending: true });
});

test('keeps a non-winning recovery node in pending mode', async () => {
  recoveryResult = defaultResult();
  const state = { mariaProcess: {} };
  const onRecoveryBootstrap = jest.fn().mockResolvedValue(false);
  await startSupervisor({ ...dependencies(), state, onRecoveryBootstrap });
  await captured.pending.onRecoveryBootstrap({ epoch: 9, winner: { node: 'node-b' } });
  expect(captured.processController.start).not.toHaveBeenCalled();
  expect(onRecoveryBootstrap).toHaveBeenCalled();
});

test('runs the joiner coordinator only after local winner runtime startup', async () => {
  recoveryResult = defaultResult();
  const recoverJoiners = jest.fn().mockResolvedValue(undefined);
  await startSupervisor({ ...dependencies(), state: { mariaProcess: {} }, recoverJoiners });
  await captured.pending.onRecoveryBootstrap({ epoch: 15, winner: { node: 'node-a' }, clusterId: 'cluster-a' });
  expect(recoverJoiners).toHaveBeenCalledWith(expect.objectContaining({ bootstrap: expect.objectContaining({ epoch: 15 }), runtime: expect.any(Object) }));
});

test('does not run the joiner coordinator on a non-winning node', async () => {
  recoveryResult = defaultResult();
  const recoverJoiners = jest.fn();
  captured.runtimeOptions = undefined;
  await startSupervisor({ ...dependencies(), state: { mariaProcess: {} }, recoverJoiners });
  await captured.pending.onRecoveryBootstrap({ epoch: 16, winner: { node: 'node-b' } });
  expect(recoverJoiners).not.toHaveBeenCalled();
  expect(captured.runtimeOptions).toBeUndefined();
});

test('wires an authenticated join request to join startup and runtime', async () => {
  recoveryResult = defaultResult();
  await startSupervisor({ ...dependencies(), state: { mariaProcess: {} } });
  captured.processController.start.mockClear();
  await expect(captured.pending.onRecoveryJoin({ winnerAddress: 'node-a', epoch: 17, clusterId: 'cluster-a', quorum: ['node-a', 'node-b'] })).resolves.toMatchObject({ node: 'node-a', status: 'ready' });
  expect(captured.processController.start).toHaveBeenCalledWith(expect.arrayContaining(['--wsrep-cluster-address=gcomm://node-a']));
  expect(captured.runtimeOptions.startupDecision).toMatchObject({ mode: 'join', bootstrapComplete: true, epoch: 17 });
});

test('starts normal non-blocked startup without the pending recovery listener', async () => {
  recoveryResult = { ...defaultResult(), startupDecision: { mode: 'join', reason: 'active peer' } };
  const deps = dependencies();
  await expect(startSupervisor(deps)).resolves.toBeUndefined();
  expect(captured.pending).toBeDefined();
});

test('awaits the shared HTTP listener before recovery preparation', async () => {
  recoveryResult = { ...defaultResult(), startupDecision: { mode: 'join', reason: 'active peer' } };
  const order = [];
  const deps = dependencies();
  deps.probes = { start: jest.fn(async (_port, _host, callback) => { order.push('listener'); callback(); }) };
  const { prepareSupervisorRecovery } = await import('../../src/runtime/recovery-startup.mjs');
  prepareSupervisorRecovery.mockImplementationOnce(async () => { order.push('recovery'); return recoveryResult; });
  await startSupervisor(deps);
  expect(order).toEqual(['listener', 'recovery']);
});

test('starts ordinary local bootstrap and records its initial recovery state', async () => {
  recoveryResult = { ...defaultResult(), startupDecision: { mode: 'bootstrap', localWinner: true, epoch: 13, recoveryEpoch: { clusterId: 'cluster-a', quorum: ['node-a', 'node-b'] } } };
  const deps = dependencies();
  await expect(startSupervisor(deps)).resolves.toBeUndefined();
  expect(deps.recoveryState.set).toHaveBeenCalledWith('bootstrapping', { epoch: 13 });
  expect(deps.state.routingTimer).toBe('routing');
  expect(deps.state.peerTimer).toBe('peer');
});

test('wires cold-bootstrap and startup-service callbacks', async () => {
  recoveryResult = { ...defaultResult(), startupDecision: { mode: 'join', reason: 'active peer' } };
  const deps = dependencies();
  deps.state.restarting = false;
  deps.state.shuttingDown = false;
  await startSupervisor(deps);
  expect(captured.coldBootstrap.bootstrapLocal()).toBeUndefined();
  captured.startupServices.setRestarting(true);
  expect(deps.state.restarting).toBe(true);
  expect(captured.startupServices.isRestarting()).toBe(true);
  captured.startupServices.setRestarting(false);
  expect(captured.startupServices.isRestarting()).toBe(false);
  expect(deps.state.db).toEqual({ connected: true });
  captured.startupServices.loadIntent();
  captured.startupServices.intentState.apply({ apiVersion: 'v1' });
  expect(captured.startupServices.shuttingDown()).toBe(false);
  const exit = jest.spyOn(process, 'exit').mockImplementation(() => {});
  captured.startupServices.onFatal();
  captured.startupServices.onFatal(7);
  expect(exit).toHaveBeenCalledWith(1);
  expect(exit).toHaveBeenCalledWith(7);
  exit.mockRestore();
});

test('invokes the default recovery bootstrap callback during local recovery', async () => {
  recoveryResult = defaultResult();
  await expect(startSupervisor({ ...dependencies(), state: { mariaProcess: {} } })).resolves.toEqual({ pending: true });
  await captured.pending.onRecoveryBootstrap({ epoch: 14, winner: { node: 'node-a' } });
  expect(captured.processController.start).toHaveBeenCalled();
});

test('invokes the default recovery completion callback in pending mode', async () => {
  recoveryResult = defaultResult();
  await expect(startSupervisor({ ...dependencies(), state: { mariaProcess: {} } })).resolves.toEqual({ pending: true });
  await expect(captured.pending.onRecoveryComplete({ phase: 'complete' })).resolves.toBeUndefined();
});

test('propagates runtime startup failures after recovery handoff', async () => {
  recoveryResult = defaultResult();
  runtimeFailure = new Error('runtime start failed');
  const state = { mariaProcess: {} };
  await startSupervisor({ ...dependencies(), state });
  await expect(captured.pending.onRecoveryBootstrap({ epoch: 10, winner: { node: 'node-a' } })).rejects.toThrow('runtime start failed');
  runtimeFailure = undefined;
});

test('propagates MariaDB process-start failures during recovery handoff', async () => {
  recoveryResult = defaultResult();
  processFailure = new Error('mariadbd start failed');
  await startSupervisor({ ...dependencies(), state: { mariaProcess: {} } });
  await expect(captured.pending.onRecoveryBootstrap({ epoch: 11, winner: { node: 'node-a' } })).rejects.toThrow('mariadbd start failed');
  processFailure = undefined;
});

test('propagates recovery callback failures after runtime startup', async () => {
  recoveryResult = defaultResult();
  const callbackFailure = new Error('recovery callback failed');
  await startSupervisor({ ...dependencies(), state: { mariaProcess: {} }, onRecoveryBootstrap: jest.fn().mockRejectedValue(callbackFailure) });
  await expect(captured.pending.onRecoveryBootstrap({ epoch: 12, winner: { node: 'node-a' } })).rejects.toThrow('recovery callback failed');
});
