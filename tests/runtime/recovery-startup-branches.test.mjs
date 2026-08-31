import { expect, jest, test } from '@jest/globals';

const listen = jest.fn(async () => {});
const close = jest.fn(async () => {});
const set = jest.fn();
const plan = jest.fn(async () => ({ mode: 'bootstrap', localWinner: false }));
const record = jest.fn(async () => {});
const authorize = jest.fn(async ({ decision }) => ({ decision, args: ['--recovered'] }));
const rejoin = jest.fn(async ({ decision }) => decision);
const resolveExplicit = jest.fn(async () => ({ explicit: false }));
let evidenceOptions;

jest.unstable_mockModule('../../src/runtime/cold-recovery-wiring.mjs', () => ({
  createSupervisorColdRecovery: () => ({ evidence: {}, members: [{ name: 'node-a' }], protocol: { plan } }),
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

test('continues when authorization does not replace process arguments', async () => {
  authorize.mockResolvedValueOnce({ decision: { mode: 'join' } });
  const result = await prepareSupervisorRecovery({ startupConfiguration: { initialIntent: { cluster: { members: [{}] } }, args: ['--original'] }, intentState: {}, config: { elera: true, dataDir: 'data', httpPort: 8080 }, identity: { name: 'node-a' }, health: {}, recoveryState: { set: jest.fn() }, recoveryAudit: {}, log: {}, environment: {}, mariaProcess: {} });
  expect(result.args).toEqual(['--original']);
});
