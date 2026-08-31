import { expect, jest, test } from '@jest/globals';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const createControlApi = jest.fn((options) => ({ options }));
jest.unstable_mockModule('../../src/control-api.mjs', () => ({ createControlApi }));
const { createSupervisorControlComposition } = await import('../../src/runtime/control-composition.mjs');

test('composes the control API with cluster and runtime dependencies', async () => {
  const dataDir = await mkdtemp(join(tmpdir(), 'supervisor-reset-'));
  const query = jest.fn();
  const stop = jest.fn();
  const observationStore = { all: jest.fn().mockImplementationOnce(() => [{ nodeId: 'donor', synced: true, primary: 'Primary', health: 'ok' }]).mockImplementation(() => [{ node: 'donor', healthy: true, primary: true }]) };
  const result = createSupervisorControlComposition({ db: { query }, metadata: {}, managed: {}, applications: {}, reconciler: {}, artifactStore: {}, routingBundles: { lease: jest.fn() }, routingEvent: jest.fn(), recovery: { status: jest.fn(() => ({})) }, observationStore, health: { status: jest.fn(async () => ({ ready: false })), cacheInfo: jest.fn(() => ({})) }, clusterDrain: { set: jest.fn() }, lifecycle: { get: jest.fn() }, telemetry: { summary: jest.fn(), details: jest.fn() }, config: { elera: true, runtimeNodeName: 'supervisor', dataDir }, intentState: {}, coldState: { drain: { isDraining: jest.fn(() => false), active: jest.fn(() => 0) }, clusterDrain: { set: jest.fn() } }, processController: { stop, start: jest.fn() }, applyIntent: jest.fn(), environment: {}, log: {} });
  expect(result).toBeDefined();
  const options = result.options;
  expect(options.getConfig()).toEqual(expect.objectContaining({ elera: true, runtimeNodeName: 'supervisor', dataDir }));
  await options.getStatus();
  options.getTraffic();
  options.getTelemetry();
  options.getTelemetryDetails('app');
  options.setDrain(true, false);
  options.getActiveIntent();
  options.getActiveIntent.apply({});
  options.leaseCredentials({});
  options.getColdBootstrap();
  options.getColdEvidence();
  options.getColdRecoveryProtocol();
  options.getColdBootstrapLocal();
  await expect(options.nodeDataReset.reset({ node: 'supervisor', dataDir, confirmation: 'RESET supervisor', dryRun: true })).resolves.toMatchObject({ status: 'planned' });
  await expect(options.nodeDataReset.reset({ node: 'supervisor', dataDir, confirmation: 'RESET supervisor', dryRun: true, force: true, fenced: true, routingExcluded: true, recoveryDisposition: 'single-member-resync' })).resolves.toMatchObject({ status: 'planned' });
  await expect(options.nodeDataReset.reset({ node: 'supervisor', dataDir, confirmation: 'RESET supervisor', dryRun: false, idempotencyKey: 'composition-reset' })).resolves.toMatchObject({ status: 'completed' });
  expect(stop).toHaveBeenCalled();
  options.bootstrap();
  await options.db.query('SELECT 1');
  await options.lifecycle.plan('bootstrap');
  await options.lifecycle.execute('bootstrap', { confirm: true });
  expect(query).toHaveBeenCalled();
  await rm(dataDir, { recursive: true, force: true });
});

test('executes resync only after supervisor fencing and exclusion are verified', async () => {
  const dataDir = await mkdtemp(join(tmpdir(), 'supervisor-resync-'));
  const order = [];
  let draining = false;
  const processController = { stop: jest.fn(() => order.push('stop')), start: jest.fn(() => order.push('restart')) };
  const result = createSupervisorControlComposition({
    db: { query: jest.fn() }, metadata: {}, managed: {}, applications: {}, reconciler: {}, artifactStore: {}, routingBundles: { lease: jest.fn() }, routingEvent: jest.fn(),
    recovery: { status: jest.fn(() => ({})) }, observationStore: { all: () => [{ nodeId: 'donor', health: 'ok', primary: 'Primary' }] },
    health: { status: jest.fn(async () => ({ ready: true, values: { wsrep_local_state_comment: 'Synced', wsrep_ready: 'ON', wsrep_cluster_status: 'Primary' } })), cacheInfo: () => ({}) },
    clusterDrain: {}, lifecycle: { get: () => 'running' }, telemetry: { summary: () => ({}), details: () => ({}) }, config: { elera: true, runtimeNodeName: 'target', dataDir, shutdownTimeoutMs: 100, resyncPollMs: 1, resyncTimeoutMs: 100 }, intentState: {},
    coldState: { drain: { isDraining: () => draining, active: () => 0 }, clusterDrain: { set: (value) => { draining = value; order.push(value ? 'fence' : 'undrain'); } } }, processController,
    applyIntent: jest.fn(), environment: {}, log: { reset: (event) => order.push(`reset:${event}`) },
  });
  try {
    const removeIndex = order.length;
    await expect(result.options.nodeDataReset.reset({ node: 'target', dataDir, force: true, recoveryDisposition: 'single-member-resync', confirmation: 'RESET target', idempotencyKey: 'composition-resync' })).resolves.toMatchObject({ donor: 'donor', next: 're-included' });
    expect(order.slice(removeIndex)).toEqual(['fence', 'fence', 'stop', 'restart', 'reset:[object Object]']);
    expect(processController.stop).toHaveBeenCalled();
    expect(processController.start).toHaveBeenCalled();
  } finally { await rm(dataDir, { recursive: true, force: true }); }
});
