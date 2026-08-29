import { expect, test, jest } from '@jest/globals';
import { createShutdown } from '../../src/lifecycle/shutdown.mjs';
import { createLifecycleState } from '../../src/lifecycle/state.mjs';

test('orders drain, service closure, MariaDB stop, and cleanup', async () => {
  const calls = []; const lifecycle = createLifecycleState();
  const shutdown = createShutdown({ lifecycle, sqlQuiesce: { begin: async () => calls.push('quiesce') }, drain: { wait: async () => calls.push('drain') }, routingBus: { close: () => calls.push('bus') }, routingStream: { close: () => calls.push('stream') }, servers: [{}], closeServer: async () => calls.push('server'), getMariaProcess: () => ({ stop: async () => { calls.push('maria'); return { forced: false }; } }), getDb: () => ({ close: async () => calls.push('db') }), errors: { removeHandlers: () => calls.push('errors') }, log: { info: jest.fn() } });
  await expect(shutdown('SIGTERM')).resolves.toMatchObject({ state: 'stopped', forced: false });
  expect(calls).toEqual(['quiesce', 'bus', 'stream', 'server', 'maria', 'db', 'errors']);
  expect(lifecycle.get()).toBe('stopped');
});

test('broadcasts shutdown handoff before quiescing SQL', async () => {
  const calls = []; const lifecycle = createLifecycleState();
  const shutdown = createShutdown({ lifecycle, sqlQuiesce: { begin: async () => calls.push('quiesce') }, drain: { wait: async () => {} }, routingStream: { shutdown: async (event) => calls.push(['stream', event]) }, getMariaProcess: () => ({ stop: async () => ({ forced: false }) }), log: {} });
  await shutdown('SIGTERM');
  expect(calls[0]).toEqual(['stream', { reason: 'SIGTERM', reconnectDeadlineMs: 60000 }]);
  expect(calls[1]).toBe('quiesce');
});

test('uses one bounded quiesce window and transitions through draining and stopping', async () => {
  const states = []; const lifecycle = createLifecycleState({ onChange: (state) => states.push(state) }); const quiesce = { begin: jest.fn(async (timeout) => { expect(timeout).toBe(30000); }) }; const drain = { wait: jest.fn() };
  const shutdown = createShutdown({ lifecycle, sqlQuiesce: quiesce, drain, shutdownCondition: () => 'last-survivor', routingStream: { shutdown: jest.fn() }, getMariaProcess: () => ({ stop: jest.fn(async (timeout) => { expect(timeout).toBe(60000); return { forced: false }; }) }), log: {} });
  await shutdown('SIGTERM');
  expect(states).toEqual(['draining', 'stopping', 'stopped']);
  expect(drain.wait).not.toHaveBeenCalled();
});

test('propagates shutdown drain before notifying clients and tolerates peer failure', async () => {
  const calls = []; const lifecycle = createLifecycleState();
  const shutdown = createShutdown({ lifecycle, sqlQuiesce: { begin: async () => calls.push('quiesce') }, drain: { wait: async () => {} }, propagateDrain: async () => { calls.push('propagate'); throw new Error('peer unavailable'); }, routingStream: { shutdown: async () => calls.push('notify') }, getMariaProcess: () => ({ stop: async () => ({ forced: false }) }), log: { warn: jest.fn() } });
  await shutdown('SIGTERM');
  expect(calls.slice(0, 3)).toEqual(['propagate', 'notify', 'quiesce']);
});

test('continues local shutdown when routing shutdown notification fails', async () => {
  const calls = [];
  const shutdown = createShutdown({ lifecycle: createLifecycleState(), sqlQuiesce: { begin: async () => calls.push('quiesce') }, drain: { wait: async () => {} }, routingStream: { shutdown: async () => { throw new Error('socket closed'); }, close: () => calls.push('stream') }, getMariaProcess: () => ({ stop: async () => { calls.push('maria'); return { forced: false }; } }), log: { warn: jest.fn() } });
  await expect(shutdown('SIGTERM')).resolves.toMatchObject({ state: 'stopped' });
  expect(calls).toEqual(['quiesce', 'stream', 'maria']);
});

test('reports forced MariaDB escalation and ignores repeated signals', async () => {
  const lifecycle = createLifecycleState(); const log = { warn: jest.fn(), error: jest.fn() };
  const shutdown = createShutdown({ lifecycle, sqlQuiesce: { begin: async () => {} }, drain: { wait: async () => {} }, getMariaProcess: () => ({ stop: async () => ({ forced: true }) }), log });
  await expect(shutdown('SIGTERM')).resolves.toMatchObject({ forced: true });
  await expect(shutdown('SIGTERM')).resolves.toMatchObject({ repeated: true });
  expect(log.error).toHaveBeenCalled();
  expect(log.warn).toHaveBeenCalled();
});

test('uses the stopping fallback when lifecycle has no getter', async () => {
  const lifecycle = { set: jest.fn() };
  const shutdown = createShutdown({ lifecycle, sqlQuiesce: { begin: async () => {} }, drain: { wait: async () => {} }, servers: [{}] });
  await shutdown('SIGTERM');
  await expect(shutdown('SIGTERM')).resolves.toMatchObject({ state: 'stopping', repeated: true });
});

test('validates dependencies and cleans timer and database failures', async () => {
  expect(() => createShutdown()).toThrow('shutdown dependencies');
  const clear = jest.spyOn(globalThis, 'clearInterval');
  const log = { error: jest.fn() };
  const shutdown = createShutdown({ lifecycle: createLifecycleState(), sqlQuiesce: { begin: async () => {} }, drain: { wait: async () => {} }, getTimers: () => [{}], getDb: () => ({ close: async () => { throw new Error('close'); } }), log });
  await shutdown('SIGTERM');
  expect(clear).toHaveBeenCalled();
  expect(log.error).toHaveBeenCalled();
  clear.mockRestore();
});
