import { expect, jest, test } from '@jest/globals';
import { createSupervisorStartupServices } from '../../src/runtime/startup-services.mjs';

test('composes process, intent, and bootstrap services', () => {
  const onUnexpectedExit = jest.fn();
  const createProcessImpl = jest.fn(({ onUnexpectedExit: callback }) => { onUnexpectedExit.mockImplementation(callback); return { stop: jest.fn(), start: jest.fn() }; });
  const result = createSupervisorStartupServices({ args: [], config: { timeoutMs: 1, dataDir: 'data' }, log: {}, recoveryState: { set: jest.fn() }, recoveryAudit: { failure: jest.fn() }, isRestarting: () => false, setRestarting: jest.fn(), onFatal: jest.fn(), health: {}, startupDecision: {}, recoveryCompletion: {}, coldRecoveryProtocol: {}, startupServer: {}, identity: {}, signals: {}, loadIntent: jest.fn(() => ({})), intentState: {}, environment: {}, createProcessImpl });
  expect(result.processController).toBeDefined(); expect(result.applyIntent).toEqual(expect.any(Function)); expect(result.bootstrapMaria).toEqual(expect.any(Function));
  expect(result.loadActiveIntent()).toEqual({});
  expect(result.loadActiveIntent.apply).toEqual(expect.any(Function));
  onUnexpectedExit(1);
});
