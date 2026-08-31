import { expect, jest, test } from '@jest/globals';
import { createSupervisorProcess } from '../../src/runtime/process-wiring.mjs';

test('creates process and cold-bootstrap wiring with shared restart state', () => {
  const recoveryState = { set: jest.fn() };
  const recoveryAudit = { failure: jest.fn() };
  let restarting = false;
  const onFatal = jest.fn();
  let processOptions;
  let bootstrapOptions;
  const result = createSupervisorProcess({
    args: [],
    config: { elera: true, timeoutMs: 10, shuttingDown: () => false },
    log: { error: jest.fn(), warn: jest.fn() },
    recoveryState,
    recoveryAudit,
    isRestarting: () => restarting,
    setRestarting: (value) => { restarting = value; },
    createProcessImpl: (options) => { processOptions = options; return { start: jest.fn(), stop: jest.fn() }; },
    createBootstrapImpl: (options) => { bootstrapOptions = options; return jest.fn(); },
    onFatal,
  });
  expect(result.processController).toEqual(expect.objectContaining({ start: expect.any(Function), stop: expect.any(Function) }));
  expect(result.bootstrapLocal).toEqual(expect.any(Function));
  expect(bootstrapOptions.isBusy()).toBe(false);
  bootstrapOptions.setBusy(true);
  expect(restarting).toBe(true);
  processOptions.onUnexpectedExit(7);
  expect(recoveryState.set).toHaveBeenCalledWith('cluster-unavailable', { reason: 'mariadbd exited with 7' });
  expect(recoveryAudit.failure).toHaveBeenCalledWith({ reason: 'mariadbd exited with 7' });
  expect(onFatal).not.toHaveBeenCalled();
  restarting = false;
  processOptions.onUnexpectedExit(null);
  expect(onFatal).toHaveBeenCalledWith(null);

  const quietProcess = createSupervisorProcess({
    args: [],
    config: { elera: false, timeoutMs: 10, shuttingDown: () => true },
    log: { error: jest.fn(), warn: jest.fn() },
    recoveryState,
    recoveryAudit,
    isRestarting: () => false,
    setRestarting: jest.fn(),
    onFatal,
    createProcessImpl: (options) => { processOptions = options; return { start: jest.fn(), stop: jest.fn() }; },
    createBootstrapImpl: () => jest.fn(),
  });
  expect(quietProcess.processController).toBeDefined();
  processOptions.onUnexpectedExit(0);
  expect(onFatal).toHaveBeenCalledTimes(1);
});
