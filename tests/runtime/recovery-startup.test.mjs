import { expect, jest, test } from '@jest/globals';
import { prepareSupervisorRecovery } from '../../src/runtime/recovery-startup.mjs';

test('prepares standalone recovery state without Elera coordination', async () => {
  const result = await prepareSupervisorRecovery({ startupConfiguration: { initialIntent: { cluster: { members: [{ name: 'node-a', address: '127.0.0.1' }] } }, args: [] }, intentState: {}, config: { elera: false, dataDir: 'data', httpPort: 8080 }, identity: { name: 'node-a' }, health: {}, recoveryState: {}, recoveryAudit: { event: jest.fn() }, log: {}, environment: { ELERA_RECOVERY_DECISION_PATH: 'recovery.json' }, mariaProcess: {} });
  expect(result.startupDecision).toEqual({ mode: 'standalone', reason: 'single-node configuration' }); expect(result.args).toEqual([]); expect(jest.isMockFunction).toBeDefined();
});
