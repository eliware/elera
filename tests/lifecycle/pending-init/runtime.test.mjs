import { afterEach, expect, jest, test } from '@jest/globals';
import { EventEmitter } from 'node:events';
import { log } from '@eliware/common';
import { startPendingInitRuntime as startPendingInitRuntimeImpl } from '../../../src/lifecycle/pending-init/runtime.mjs';

const environments = { ROOT_TOKEN: 'root', ELERA_HTTP_PORT: '0', MARIADB_DATA_DIR: 'data' };
const identity = { name: 'elera-0.cluster.local' };
const startPendingInitRuntime = (options = {}) => startPendingInitRuntimeImpl({ identity, ...options });
const active = new Set();

afterEach(() => {
  jest.useRealTimers();
  for (const runtime of active) runtime.shutdown();
  active.clear();
});

test('recovery runtime retries evidence automatically and cancels the timer on shutdown', async () => {
  jest.useFakeTimers();
  const retry = jest.fn().mockResolvedValue({ mode: 'blocked' });
  const runtime = startPendingInitRuntime({
    environment: environments,
    recoveryRequired: true,
    recoveryProtocol: { retry },
    listen: () => {},
    close: (_server, callback) => callback?.(),
    recoveryRetryIntervalMs: 250
  });
  active.add(runtime);
  await jest.advanceTimersByTimeAsync(750);
  expect(retry).toHaveBeenCalledTimes(3);
  runtime.shutdown();
  await jest.advanceTimersByTimeAsync(750);
  expect(retry).toHaveBeenCalledTimes(3);
});

test('non-recovery pending runtime does not schedule recovery retries', async () => {
  jest.useFakeTimers();
  const retry = jest.fn();
  const runtime = startPendingInitRuntime({ environment: environments, recoveryProtocol: { retry }, listen: () => {}, close: (_server, callback) => callback?.() });
  active.add(runtime);
  await jest.advanceTimersByTimeAsync(1000);
  expect(retry).not.toHaveBeenCalled();
});

test('recovery runtime closes its listener after the authorized bootstrap hook completes', async () => {
  const close = jest.fn((server, callback) => server.close(callback));
  const onRecoveryBootstrap = jest.fn().mockResolvedValue(undefined);
  const recoveryProtocol = { beginBootstrap: jest.fn().mockResolvedValue({ phase: 'bootstrapping', epoch: 4 }) };
  const listen = (server) => server.listen(0, '127.0.0.1');
  const runtime = startPendingInitRuntime({ environment: { ...environments, ELERA_HTTP_PORT: '0' }, recoveryRequired: true, recoveryProtocol, onRecoveryBootstrap, listen, close });
  active.add(runtime);
  await new Promise((resolve) => runtime.server.once('listening', resolve));
  const port = runtime.server.address().port;
  await fetch(`http://127.0.0.1:${port}/api/v1/cluster/cold-recovery/bootstrap`, { method: 'POST', headers: { authorization: 'Bearer root', 'content-type': 'application/json' }, body: JSON.stringify({ epoch: 4, winner: 'elera-0.cluster.local' }) });
  await new Promise((resolve) => setImmediate(resolve));
  expect(onRecoveryBootstrap).toHaveBeenCalled();
  expect(close).toHaveBeenCalledWith(runtime.server);
  runtime.shutdown();
});

test('recovery runtime keeps the listener for a non-winning bootstrap decision', async () => {
  const close = jest.fn((server, callback) => server.close(callback));
  const runtime = startPendingInitRuntime({ environment: { ...environments, ELERA_HTTP_PORT: '0' }, recoveryRequired: true, recoveryProtocol: { beginBootstrap: jest.fn().mockResolvedValue({ phase: 'bootstrapping', winner: { node: 'elera-0.example.test' } }) }, onRecoveryBootstrap: jest.fn().mockResolvedValue(false), listen: (server) => server.listen(0, '127.0.0.1'), close });
  active.add(runtime);
  await new Promise((resolve) => runtime.server.once('listening', resolve));
  const port = runtime.server.address().port;
  await fetch(`http://127.0.0.1:${port}/api/v1/cluster/cold-recovery/bootstrap`, { method: 'POST', headers: { authorization: 'Bearer root', 'content-type': 'application/json' }, body: JSON.stringify({ epoch: 4, winner: 'elera-0.cluster.local' }) });
  await new Promise((resolve) => setImmediate(resolve));
  expect(close).not.toHaveBeenCalledWith(runtime.server);
});

test('exposes the recovery join handoff through runtime wiring', async () => {
  const captured = {};
  const runtime = startPendingInitRuntime({ environment: environments, onRecoveryJoin: jest.fn().mockResolvedValue({ status: 'joining' }), createServerImpl: (options) => { captured.options = options; return { server: new EventEmitter() }; }, listen: () => {}, close: (_server, callback) => callback?.() });
  active.add(runtime);
  await expect(captured.options.onRecoveryJoin({ node: 'elera-1.example.test' })).resolves.toEqual({ status: 'joining' });
});

test('provides the default recovery join handoff', async () => {
  const captured = {};
  const runtime = startPendingInitRuntime({ environment: environments, createServerImpl: (options) => { captured.options = options; return { server: new EventEmitter() }; }, listen: () => {}, close: (_server, callback) => callback?.() });
  active.add(runtime);
  await expect(captured.options.onRecoveryJoin({ node: 'elera-1.example.test' })).resolves.toBeUndefined();
});

test('recovery runtime logs automatic retry failures', async () => {
  jest.useFakeTimers();
  const logger = log;
  const warn = jest.spyOn(logger, 'warn');
  const runtime = startPendingInitRuntime({ environment: environments, recoveryRequired: true, logger, recoveryProtocol: { retry: jest.fn().mockRejectedValue(new Error('peer unavailable')) }, listen: () => {}, close: (_server, callback) => callback?.(), recoveryRetryIntervalMs: 250 });
  active.add(runtime);
  await jest.advanceTimersByTimeAsync(250);
  expect(warn).toHaveBeenCalledWith('Automatic recovery evidence retry failed', expect.objectContaining({ error: expect.any(Error) }));
});

test('recovery runtime logs bootstrap handoff failures after responding', async () => {
  const logger = log;
  const errorLog = jest.spyOn(logger, 'error');
  const runtime = startPendingInitRuntime({ environment: { ...environments, ELERA_HTTP_PORT: '0' }, logger, recoveryRequired: true, recoveryProtocol: { beginBootstrap: jest.fn().mockResolvedValue({ phase: 'bootstrapping' }) }, onRecoveryBootstrap: jest.fn().mockRejectedValue(new Error('runtime start failed')), listen: (server) => server.listen(0, '127.0.0.1'), close: (server, callback) => server.close(callback) });
  active.add(runtime);
  await new Promise((resolve) => runtime.server.once('listening', resolve));
  const port = runtime.server.address().port;
  const response = await fetch(`http://127.0.0.1:${port}/api/v1/cluster/cold-recovery/bootstrap`, { method: 'POST', headers: { authorization: 'Bearer root', 'content-type': 'application/json' }, body: JSON.stringify({ epoch: 4, winner: 'elera-0.cluster.local' }) });
  expect(response.status).toBe(202);
  await new Promise((resolve) => setImmediate(resolve));
  expect(errorLog).toHaveBeenCalledWith('Pending recovery bootstrap handoff failed', expect.anything());
});

test('recovery runtime logs completion handoff failures after responding', async () => {
  const logger = log;
  const errorLog = jest.spyOn(logger, 'error');
  const runtime = startPendingInitRuntime({ environment: { ...environments, ELERA_HTTP_PORT: '0' }, logger, recoveryRequired: true, recoveryProtocol: { complete: jest.fn().mockResolvedValue({ phase: 'complete' }) }, onRecoveryComplete: jest.fn().mockRejectedValue(new Error('completion failed')), listen: (server) => server.listen(0, '127.0.0.1'), close: (server, callback) => server.close(callback) });
  active.add(runtime);
  await new Promise((resolve) => runtime.server.once('listening', resolve));
  const port = runtime.server.address().port;
  const response = await fetch(`http://127.0.0.1:${port}/api/v1/cluster/cold-recovery/complete`, { method: 'POST', headers: { authorization: 'Bearer root', 'content-type': 'application/json' }, body: JSON.stringify({ epoch: 4 }) });
  expect(response.status).toBe(202);
  await new Promise((resolve) => setImmediate(resolve));
  expect(errorLog).toHaveBeenCalledWith('Pending recovery handoff failed', expect.anything());
});

test('cleans up handlers when the listener fails synchronously', () => {
  const failure = new Error('listener unavailable');
  expect(() => startPendingInitRuntime({ environment: environments, listen: () => { throw failure; } })).toThrow(failure);
});

test('logs asynchronous listener startup failures', async () => {
  const logger = log;
  const errorLog = jest.spyOn(logger, 'error');
  const failure = new Error('async listener unavailable');
  const runtime = startPendingInitRuntime({ environment: environments, logger, listen: () => Promise.reject(failure), close: (_server, callback) => callback?.() });
  active.add(runtime);
  await new Promise((resolve) => setImmediate(resolve));
  expect(errorLog).toHaveBeenCalledWith('Pending recovery listener failed to start', { error: failure });
});

test('accepts a synchronous non-Promise listener handle', () => {
  const runtime = startPendingInitRuntime({ environment: environments, listen: () => ({ listening: true }), close: (_server, callback) => callback?.() });
  active.add(runtime);
  expect(runtime.server).toBeDefined();
});

test('can shut down before the listener becomes active', () => {
  const close = jest.fn((_server, callback) => callback?.());
  const runtime = startPendingInitRuntime({ environment: environments, listen: () => {}, close });
  active.add(runtime);
  runtime.shutdown();
  runtime.shutdown();
  expect(close).toHaveBeenCalledTimes(1);
});

test('uses the default listener and close lifecycle on an ephemeral port', async () => {
  const runtime = startPendingInitRuntime({ environment: { ...environments, ELERA_HTTP_PORT: '0' } });
  active.add(runtime);
  await new Promise((resolve) => runtime.server.once('listening', resolve));
  expect(runtime.server.listening).toBe(true);
  runtime.shutdown();
  await new Promise((resolve) => runtime.server.once('close', resolve));
  expect(runtime.server.listening).toBe(false);
});

test('serves cold-bootstrap evidence through the pending runtime wiring', async () => {
  const runtime = startPendingInitRuntime({ environment: { ...environments, ELERA_HTTP_PORT: '0' }, listen: (server) => server.listen(0, '127.0.0.1'), close: (server, callback) => server.close(callback) });
  active.add(runtime);
  await new Promise((resolve) => runtime.server.once('listening', resolve));
  const port = runtime.server.address().port;
  const response = await fetch(`http://127.0.0.1:${port}/api/v1/cluster/cold-bootstrap/evidence`, { headers: { authorization: 'Bearer root' } });
  expect(response.status).toBe(503);
  expect(await response.json()).toMatchObject({ ok: false });
});

test('exposes pending initialization handoff callbacks through runtime wiring', async () => {
  const captured = {};
  const fakeServer = new EventEmitter();
  fakeServer.close = jest.fn();
  const close = jest.fn((_server, callback) => callback?.());
  const runtime = startPendingInitRuntime({
    environment: environments,
    createEvidenceImpl: (options) => { captured.evidence = options; return jest.fn(); },
    createResetImpl: (options) => { captured.reset = options; return {}; },
    createHandoffImpl: (options) => { captured.handoff = options; return jest.fn().mockResolvedValue(undefined); },
    createServerImpl: (options) => { captured.options = options; return { server: fakeServer }; },
    listen: () => {},
    close,
    exit: jest.fn(),
    spawnProcess: jest.fn(() => new EventEmitter()),
  });
  active.add(runtime);
  await captured.options.onInitialized('join-pending');
  await captured.options.onInitialized('bootstrap');
  await captured.options.onRecoveryBootstrap({ phase: 'bootstrapping' });
  await captured.options.onRecoveryComplete({ phase: 'complete' });
  await expect(captured.evidence.readState('data')).rejects.toThrow();
  captured.evidence.inspect('data');
  expect(captured.evidence.runRecover).toEqual(expect.any(Function));
  expect(captured.reset.getStatus).toEqual(expect.any(Function));
  expect(captured.reset.getRecoveryState()).toEqual({ state: 'pending' });
  expect(captured.handoff.bootstrapCluster).toBe(true);
  expect(captured.options.coldEvidence).toEqual(expect.any(Function));
  expect(close).toHaveBeenCalledWith(fakeServer);
  runtime.shutdown();
});

test('covers recovery bootstrap false and rejected handoff outcomes', async () => {
  const captured = {};
  const fakeServer = new EventEmitter();
  const close = jest.fn();
  const runtime = startPendingInitRuntime({
    environment: environments,
    createServerImpl: (options) => { captured.options = options; return { server: fakeServer }; },
    listen: () => {}, close, onRecoveryBootstrap: jest.fn()
  });
  active.add(runtime);
  await expect(captured.options.onRecoveryBootstrap({ winner: 'other' })).resolves.toBeUndefined();
  expect(close).toHaveBeenCalledWith(fakeServer);
  runtime.shutdown();
});

test('handles a promise-based listener that rejects', async () => {
  const logger = log;
  const errorLog = jest.spyOn(logger, 'error');
  const failure = new Error('listen failed');
  const runtime = startPendingInitRuntime({ environment: environments, logger, listen: () => Promise.reject(failure), close: (_server, callback) => callback?.() });
  active.add(runtime);
  await new Promise((resolve) => setImmediate(resolve));
  expect(errorLog).toHaveBeenCalledWith('Pending recovery listener failed to start', { error: failure });
});

test('uses runtime defaults when data-directory environment values are absent', async () => {
  const captured = {};
  const runtime = startPendingInitRuntime({
    environment: { ROOT_TOKEN: 'root' },
    createEvidenceImpl: (options) => { captured.evidence = options; return jest.fn(); },
    createResetImpl: (options) => { captured.reset = options; return { reset: jest.fn() }; },
    createServerImpl: ({ server, ...options }) => { captured.server = options; return { server: new EventEmitter() }; },
    listen: () => {}, close: (_server, callback) => callback?.()
  });
  active.add(runtime);
  expect(captured.evidence.dataDir).toBe('/var/lib/mysql');
  expect(captured.reset.dataDir).toBe('/var/lib/mysql');
  expect(captured.reset.node).toBeDefined();
  expect(captured.reset.getStatus).toEqual(expect.any(Function));
  expect(captured.reset.getRecoveryState()).toEqual({ state: 'pending' });
  await expect(captured.reset.getStatus()).rejects.toThrow('SQL unavailable during pending recovery');
});

test('logs a failed initialization handoff after closing the listener', async () => {
  const captured = {};
  const logger = log;
  const errorLog = jest.spyOn(logger, 'error');
  const runtime = startPendingInitRuntime({
    environment: environments, logger,
    createServerImpl: (options) => { captured.options = options; return { server: new EventEmitter() }; },
    createHandoffImpl: () => jest.fn().mockRejectedValue(new Error('handoff failed')),
    listen: () => {}, close: jest.fn()
  });
  active.add(runtime);
  captured.options.onInitialized('bootstrap');
  await new Promise((resolve) => setImmediate(resolve));
  expect(errorLog).toHaveBeenCalledWith('Pending initialization handoff failed', expect.anything());
});
