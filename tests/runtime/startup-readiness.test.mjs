import { expect, jest, test } from '@jest/globals';
import { startSupervisorReadiness } from '../../src/runtime/startup-readiness.mjs';

test('starts HTTP and waits for SQL readiness', async () => {
  const order = []; const listen = jest.fn((_port, _host, callback) => { order.push('listen'); callback(); }); const log = { info: jest.fn(), warn: jest.fn() };
  const ready = await startSupervisorReadiness({ probes: { listen }, config: { httpPort: 8080, startupTimeoutMs: 10, elera: false }, health: { status: jest.fn(async () => ({ ready: true })) }, log, join: false });
  expect(listen).toHaveBeenCalledWith(8080, '0.0.0.0', expect.any(Function)); expect(order).toEqual(['listen']); expect(ready).toBe(true);
});

test('does not expose the full API before the MariaDB socket is ready', async () => {
  const order = []; const listen = jest.fn((_port, _host, callback) => { order.push('listen'); callback(); });
  await startSupervisorReadiness({ probes: { listen }, config: { httpPort: 8080, startupTimeoutMs: 10, elera: false }, health: { status: jest.fn(async () => { order.push('sql'); return { ready: true }; }) }, log: { info: jest.fn(), warn: jest.fn() }, join: false });
  expect(order).toEqual(['sql', 'listen']);
});

test('keeps the supervisor available when SQL does not become ready', async () => {
  const log = { info: jest.fn(), warn: jest.fn(), debug: jest.fn() };
  const ready = await startSupervisorReadiness({
    probes: { listen: jest.fn((_port, _host, callback) => callback()) },
    config: { httpPort: 8080, startupTimeoutMs: 1, elera: false },
    health: { status: jest.fn(async () => { throw new Error('offline'); }) },
    log,
    join: false,
  });
  expect(ready).toBe(false);
  expect(log.warn).toHaveBeenCalledWith(expect.stringContaining('not SQL-ready'), expect.any(Object));
});

test('verifies a joined supervisor after SQL readiness', async () => {
  const status = jest.fn()
    .mockResolvedValueOnce({ ready: true })
    .mockResolvedValueOnce({ values: { wsrep_cluster_state_uuid: 'cluster-a', wsrep_cluster_status: 'Primary', wsrep_local_state_comment: 'Synced', wsrep_ready: 'ON', wsrep_cluster_size: 2 } });
  const recoveryState = { set: jest.fn() };
  const recoveryAudit = { joinComplete: jest.fn(), failure: jest.fn() };
  const ready = await startSupervisorReadiness({
    probes: { listen: jest.fn((_port, _host, callback) => callback()) },
    config: { httpPort: 8080, startupTimeoutMs: 10, elera: true },
    health: { status },
    log: { info: jest.fn(), warn: jest.fn() },
    join: true,
    startupDecision: { mode: 'join', epoch: 3, recoveryEpoch: { clusterId: 'cluster-a' } },
    initialIntent: { cluster: { members: [{}, {}] } },
    recoveryState,
    recoveryAudit,
    identity: { name: 'node-a' },
  });
  expect(ready).toBe(true);
  expect(recoveryState.set).toHaveBeenCalledWith('complete', expect.any(Object));
  expect(recoveryAudit.joinComplete).toHaveBeenCalled();
});
