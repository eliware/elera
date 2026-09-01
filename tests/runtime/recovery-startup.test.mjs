import { expect, jest, test } from '@jest/globals';
import { mkdtemp, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const listen = jest.fn(async () => {});
const close = jest.fn(async () => {});
const set = jest.fn();
const plan = jest.fn(async () => ({ mode: 'bootstrap', localWinner: false }));
const retry = jest.fn(async () => ({ mode: 'blocked', reason: 'still unavailable' }));
const evidence = jest.fn(async () => [{ node: 'node-b', active: true, galera: { clusterStatus: 'Primary' } }]);
const record = jest.fn(async () => {});
const authorize = jest.fn(async ({ decision }) => ({ decision, args: ['--recovered'] }));
const rejoin = jest.fn(async ({ decision }) => decision);
const resolveExplicit = jest.fn(async () => ({ explicit: false }));
let evidenceOptions;

jest.unstable_mockModule('../../src/runtime/cold-recovery-wiring.mjs', () => ({
  createSupervisorColdRecovery: () => ({ evidence: {}, members: [{ name: 'node-a' }, { name: 'node-b' }], protocol: { plan, retry, evidence } }),
}));
jest.unstable_mockModule('../../src/cluster/cold-bootstrap/startup-evidence-server.mjs', () => ({ createStartupEvidenceServer: () => ({ listen, close }) }));
jest.unstable_mockModule('../../src/runtime/startup-decision-wiring.mjs', () => ({ resolveExplicitSupervisorStartup: resolveExplicit }));
jest.unstable_mockModule('../../src/runtime/recovery-startup-decision.mjs', () => ({ recoveryStartupDecision: (decision) => decision }));
jest.unstable_mockModule('../../src/runtime/recovery-decision.mjs', () => ({ recordSupervisorRecoveryDecision: record }));
jest.unstable_mockModule('../../src/runtime/recovery-authorization.mjs', () => ({ authorizeSupervisorRecovery: authorize }));
jest.unstable_mockModule('../../src/runtime/rejoin-decision.mjs', () => ({ resolveSupervisorRejoin: rejoin }));
jest.unstable_mockModule('../../src/cluster/cold-bootstrap/startup-local-evidence.mjs', () => ({ createStartupLocalEvidence: (options) => { evidenceOptions = options; return {}; } }));
jest.unstable_mockModule('../../src/cluster/cold-bootstrap/completion.mjs', () => ({ createRecoveryCompletion: () => ({}) }));
jest.unstable_mockModule('../../src/cluster/cold-bootstrap/lease.mjs', () => ({ createRecoveryLease: () => ({}) }));

const { prepareSupervisorRecovery } = await import('../../src/runtime/recovery-startup.mjs');

test('coordinates Elera recovery and closes evidence server after non-bootstrap decision', async () => {
  const result = await prepareSupervisorRecovery({
    startupConfiguration: { initialIntent: { cluster: { members: [{ name: 'node-a' }] } }, args: ['--safe'] },
    intentState: {}, config: { elera: true, dataDir: 'data', httpPort: 8080 }, identity: { name: 'node-a' },
    health: {}, recoveryState: { set }, recoveryAudit: {}, log: {}, environment: { ROOT_TOKEN: 'token' }, mariaProcess: { child: { exitCode: 1 } },
  });
  expect(result.args).toEqual(['--recovered']);
  expect(set).toHaveBeenCalledWith('collecting-evidence');
  expect(listen).toHaveBeenCalled();
  expect(close).toHaveBeenCalled();
  expect(record).toHaveBeenCalled();
  await expect(evidenceOptions.readState('data')).rejects.toThrow('ENOENT');
  evidenceOptions.isActive();
});

test('mounts recovery routes on the shared listener without creating a temporary server', async () => {
  plan.mockResolvedValueOnce({ mode: 'bootstrap', localWinner: false });
  const setStartupHandler = jest.fn();
  const result = await prepareSupervisorRecovery({
    startupConfiguration: { initialIntent: { cluster: { members: [{ name: 'node-a' }] } }, args: [] },
    intentState: {}, config: { elera: true, dataDir: 'data', httpPort: 8080 }, identity: { name: 'node-a' }, health: {}, recoveryState: { set: jest.fn() }, recoveryAudit: {}, log: {}, environment: { ROOT_TOKEN: 'token' }, mariaProcess: {}, probes: { setStartupHandler }
  });
  expect(setStartupHandler).toHaveBeenCalledWith(undefined);
  expect(result.startupServer).toBeUndefined();
});

test('keeps the shared listener open for a clean-restart join', async () => {
  const setStartupHandler = jest.fn();
  const consume = jest.fn(async () => ({ node: 'node-a', nonce: 'shared' }));
  const result = await prepareSupervisorRecovery({ startupConfiguration: { initialIntent: { cluster: { members: [{ name: 'node-a' }, { name: 'node-b' }] } }, args: [] }, intentState: {}, config: { elera: true, dataDir: 'data', httpPort: 8080 }, identity: { name: 'node-a' }, health: {}, recoveryState: { set: jest.fn() }, recoveryAudit: {}, log: {}, environment: {}, mariaProcess: {}, probes: { setStartupHandler }, restartMarker: { consume } });
  expect(result.startupDecision.mode).toBe('join');
  expect(result.startupServer).toBeUndefined();
});

test('retains the evidence server for the local bootstrap winner', async () => {
  plan.mockResolvedValueOnce({ mode: 'bootstrap', localWinner: true });
  const before = close.mock.calls.length;
  const result = await prepareSupervisorRecovery({ startupConfiguration: { initialIntent: { cluster: { members: [{}] } }, args: [] }, intentState: {}, config: { elera: true, dataDir: 'data', httpPort: 8080 }, identity: { name: 'node-a' }, health: {}, recoveryState: { set: jest.fn() }, recoveryAudit: {}, log: {}, environment: { ELERA_PEER_TOKEN: 'peer' }, mariaProcess: { child: { exitCode: null } } });
  expect(result.startupServer).toBeDefined();
  expect(close.mock.calls.length).toBe(before);
});

test('honors an explicit startup decision without opening coordination', async () => {
  resolveExplicit.mockResolvedValueOnce({ explicit: true, decision: { mode: 'standalone' }, args: ['--explicit'] });
  const result = await prepareSupervisorRecovery({ startupConfiguration: { initialIntent: { cluster: { members: [{}] } }, args: [] }, intentState: {}, config: { elera: true, dataDir: 'data', httpPort: 8080 }, identity: { name: 'node-a' }, health: {}, recoveryState: { set: jest.fn() }, recoveryAudit: {}, log: {}, environment: {}, mariaProcess: {} });
  expect(result.args).toEqual(['--explicit']);
  expect(result.startupDecision.mode).toBe('standalone');
});

test('returns the standalone decision when Elera mode is disabled', async () => {
  const result = await prepareSupervisorRecovery({
    startupConfiguration: { initialIntent: { cluster: { members: [] } }, args: ['--standalone'] },
    intentState: {}, config: { elera: false, dataDir: 'data', httpPort: 8080 }, identity: { name: 'node-a' },
    health: {}, recoveryState: { set: jest.fn() }, recoveryAudit: {}, log: {}, environment: {}, mariaProcess: {}
  });
  expect(result.startupDecision).toEqual({ mode: 'standalone', reason: 'single-node configuration' });
});

test('continues when authorization does not replace process arguments', async () => {
  authorize.mockResolvedValueOnce({ decision: { mode: 'join' } });
  const result = await prepareSupervisorRecovery({ startupConfiguration: { initialIntent: { cluster: { members: [{}] } }, args: ['--original'] }, intentState: {}, config: { elera: true, dataDir: 'data', httpPort: 8080 }, identity: { name: 'node-a' }, health: {}, recoveryState: { set: jest.fn() }, recoveryAudit: {}, log: {}, environment: {}, mariaProcess: {} });
  expect(result.args).toEqual(['--original']);
});

test('keeps original arguments when authorization returns no replacement', async () => {
  authorize.mockClear();
  plan.mockResolvedValueOnce({ mode: 'bootstrap', localWinner: false });
  authorize.mockResolvedValueOnce({ decision: { mode: 'bootstrap', localWinner: false } });
  const result = await prepareSupervisorRecovery({ startupConfiguration: { initialIntent: { cluster: { members: [{ name: 'node-a' }] } }, args: ['--original'] }, intentState: {}, config: { elera: true, dataDir: 'data', httpPort: 8080 }, identity: { name: 'node-a' }, health: {}, recoveryState: { set: jest.fn() }, recoveryAudit: {}, log: {}, environment: {}, mariaProcess: {} });
  expect(result.args).toEqual(['--original']);
});

test('uses a valid clean marker and active Primary peer for ordinary join', async () => {
  const consume = jest.fn(async () => ({ node: 'node-a', epoch: null, nonce: 'n' }));
  const result = await prepareSupervisorRecovery({ startupConfiguration: { initialIntent: { cluster: { members: [{ name: 'node-a' }, { name: 'node-b' }] } }, args: [] }, intentState: {}, config: { elera: true, dataDir: 'data', httpPort: 8080 }, identity: { name: 'node-a' }, health: {}, recoveryState: { set: jest.fn() }, recoveryAudit: {}, log: {}, environment: {}, mariaProcess: {}, restartMarker: { consume } });
  expect(result.startupDecision).toMatchObject({ mode: 'join', bootstrapComplete: true }); expect(consume).toHaveBeenCalled();
});

test('reads and consumes a clean-restart marker through the reader path', async () => {
  const read = jest.fn(async () => ({ node: 'node-a', epoch: 3, nonce: 'reader-nonce' }));
  const consume = jest.fn(async () => {});
  const result = await prepareSupervisorRecovery({ startupConfiguration: { initialIntent: { cluster: { members: [{ name: 'node-a' }, { name: 'node-b' }] } }, args: [] }, intentState: {}, config: { elera: true, dataDir: 'data', httpPort: 8080, startupTimeoutMs: 1000 }, identity: { name: 'node-a' }, health: {}, recoveryState: { set: jest.fn() }, recoveryAudit: {}, log: {}, environment: {}, mariaProcess: {}, restartMarker: { read, consume } });
  expect(result.startupDecision.mode).toBe('join');
  expect(read).toHaveBeenCalled();
  expect(consume).toHaveBeenCalledWith({ expectedNonce: 'reader-nonce' });
});

test('falls through to evidence coordination when no clean-restart marker exists', async () => {
  const read = jest.fn(async () => null);
  const result = await prepareSupervisorRecovery({ startupConfiguration: { initialIntent: { cluster: { members: [{ name: 'node-a' }] } }, args: [] }, intentState: {}, config: { elera: true, dataDir: 'data', httpPort: 8080 }, identity: { name: 'node-a' }, health: {}, recoveryState: { set: jest.fn() }, recoveryAudit: {}, log: {}, environment: {}, mariaProcess: {}, restartMarker: { read } });
  expect(result.startupDecision.mode).toBe('bootstrap');
  expect(read).toHaveBeenCalled();
});

test('falls through safely when clean-restart peer evidence is unavailable', async () => {
  evidence.mockRejectedValueOnce(new Error('peer evidence unavailable'));
  const read = jest.fn(async () => ({ node: 'node-a', epoch: null, nonce: 'n-evidence' }));
  const consume = jest.fn(async () => {});
  const result = await prepareSupervisorRecovery({ startupConfiguration: { initialIntent: { cluster: { members: [{ name: 'node-a' }, { name: 'node-b' }] } }, args: [] }, intentState: {}, config: { elera: true, dataDir: 'data', httpPort: 8080, startupTimeoutMs: 1000 }, identity: { name: 'node-a' }, health: {}, recoveryState: { set: jest.fn() }, recoveryAudit: {}, log: {}, environment: {}, mariaProcess: {}, restartMarker: { read, consume } });
  expect(result.startupDecision.mode).toBe('bootstrap');
  expect(consume).not.toHaveBeenCalled();
});

test('closes the evidence server when recovery remains blocked after planning', async () => {
  plan.mockResolvedValueOnce({ mode: 'blocked', reason: 'evidence unavailable' });
  const before = close.mock.calls.length;
  const result = await prepareSupervisorRecovery({ startupConfiguration: { initialIntent: { cluster: { members: [{ name: 'node-a' }, { name: 'node-b' }] } }, args: [] }, intentState: {}, config: { elera: true, dataDir: 'data', httpPort: 8080, startupTimeoutMs: 1 }, identity: { name: 'node-a' }, health: {}, recoveryState: { set: jest.fn() }, recoveryAudit: {}, log: {}, environment: {}, mariaProcess: {} });
  expect(result.startupDecision.mode).toBe('blocked');
  expect(close.mock.calls.length).toBeGreaterThan(before);
  expect(retry).not.toHaveBeenCalled();
});

test('classifies initialized blocked recovery as normal rejoin', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'elera-rejoin-'));
  await mkdir(join(directory, 'mysql'));
  try {
    plan.mockResolvedValueOnce({ mode: 'blocked', reason: 'peer evidence unavailable' });
    const result = await prepareSupervisorRecovery({ startupConfiguration: { initialIntent: { cluster: { members: [{ name: 'node-a' }, { name: 'node-b' }] } }, args: [] }, intentState: {}, config: { elera: true, dataDir: directory, httpPort: 8080, startupTimeoutMs: 1 }, identity: { name: 'node-a' }, health: {}, recoveryState: { set: jest.fn() }, recoveryAudit: {}, log: {}, environment: {}, mariaProcess: {} });
    expect(result.startupDecision).toMatchObject({ mode: 'rejoin', bootstrapComplete: true });
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('retries a blocked recovery plan before proceeding with a later plan', async () => {
  jest.useFakeTimers();
  plan.mockResolvedValueOnce({ mode: 'blocked', reason: 'peer evidence pending' }).mockResolvedValueOnce({ mode: 'bootstrap', localWinner: false, reason: 'winner selected' });
  const pending = prepareSupervisorRecovery({ startupConfiguration: { initialIntent: { cluster: { members: [{ name: 'node-a' }, { name: 'node-b' }] } }, args: [] }, intentState: {}, config: { elera: true, dataDir: 'data', httpPort: 8080, startupTimeoutMs: 2000 }, identity: { name: 'node-a' }, health: {}, recoveryState: { set: jest.fn() }, recoveryAudit: {}, log: {}, environment: {}, mariaProcess: {} });
  await Promise.resolve();
  await jest.advanceTimersByTimeAsync(1000);
  await pending;
  expect(retry).toHaveBeenCalled();
  jest.useRealTimers();
});

test('waits for a clean-restart peer before retrying recovery coordination', async () => {
  jest.useFakeTimers();
  evidence.mockResolvedValueOnce([]);
  plan.mockResolvedValueOnce({ mode: 'blocked', reason: 'peer not ready' }).mockResolvedValueOnce({ mode: 'join', reason: 'peer ready' });
  const pending = prepareSupervisorRecovery({ startupConfiguration: { initialIntent: { cluster: { members: [{ name: 'node-a' }, { name: 'node-b' }] } }, args: [] }, intentState: {}, config: { elera: true, dataDir: 'data', httpPort: 8080, startupTimeoutMs: 2000 }, identity: { name: 'node-a' }, health: {}, recoveryState: { set: jest.fn() }, recoveryAudit: {}, log: {}, environment: {}, mariaProcess: {}, restartMarker: { consume: jest.fn(async () => ({ nonce: 'retry-nonce' })) } });
  await jest.advanceTimersByTimeAsync(1000);
  await pending;
  expect(retry).toHaveBeenCalled();
  jest.useRealTimers();
});

test('retries clean-restart peer evidence until the timeout budget is exhausted', async () => {
  jest.useFakeTimers();
  evidence.mockResolvedValue([]);
  const read = jest.fn(async () => ({ node: 'node-a', nonce: 'retry-marker' }));
  const pending = prepareSupervisorRecovery({
    startupConfiguration: { initialIntent: { cluster: { members: [{ name: 'node-a' }, { name: 'node-b' }] } }, args: [] },
    intentState: {}, config: { elera: true, dataDir: 'data', httpPort: 8080, startupTimeoutMs: 3000 },
    identity: { name: 'node-a' }, health: {}, recoveryState: { set: jest.fn() }, recoveryAudit: {}, log: {}, environment: {}, mariaProcess: {},
    restartMarker: { read, consume: jest.fn() }
  });
  await Promise.resolve();
  await jest.advanceTimersByTimeAsync(2000);
  await pending;
  expect(evidence).toHaveBeenCalled();
  expect(read).toHaveBeenCalled();
  jest.useRealTimers();
});

test('uses the bounded default clean-restart attempt count', async () => {
  jest.useFakeTimers();
  const read = jest.fn(async () => ({ node: 'node-a', nonce: 'default-budget' }));
  const pending = prepareSupervisorRecovery({
    startupConfiguration: { initialIntent: { cluster: { members: [{ name: 'node-a' }] } }, args: [] },
    intentState: {}, config: { elera: true, dataDir: 'data', httpPort: 8080 }, identity: { name: 'node-a' },
    health: {}, recoveryState: { set: jest.fn() }, recoveryAudit: {}, log: {}, environment: {}, mariaProcess: {}, restartMarker: { read }
  });
  await jest.advanceTimersByTimeAsync(14000);
  const result = await pending;
  expect(result.startupDecision).toBeDefined();
  expect(read).toHaveBeenCalled();
  jest.useRealTimers();
});

test('caps excessive clean-restart retry budgets', async () => {
  jest.useFakeTimers();
  const read = jest.fn(async () => ({ node: 'node-a', nonce: 'bounded' }));
  const pending = prepareSupervisorRecovery({
    startupConfiguration: { initialIntent: { cluster: { members: [{ name: 'node-a' }, { name: 'node-b' }] } }, args: [] },
    intentState: {}, config: { elera: true, dataDir: 'data', httpPort: 8080, startupTimeoutMs: 30000 }, identity: { name: 'node-a' },
    health: {}, recoveryState: { set: jest.fn() }, recoveryAudit: {}, log: {}, environment: {}, mariaProcess: {}, restartMarker: { read }
  });
  await jest.advanceTimersByTimeAsync(14000);
  await pending;
  expect(read).toHaveBeenCalled();
  jest.useRealTimers();
});
