import { expect, jest, test } from '@jest/globals';

const createControlApi = jest.fn((options) => ({ options }));
jest.unstable_mockModule('../../src/control-api.mjs', () => ({ createControlApi }));
const { createSupervisorControlComposition } = await import('../../src/runtime/control-composition.mjs');

test('composes the control API with cluster and runtime dependencies', async () => {
  const query = jest.fn();
  const result = createSupervisorControlComposition({ db: { query }, metadata: {}, managed: {}, applications: {}, reconciler: {}, artifactStore: {}, routingBundles: { lease: jest.fn() }, routingEvent: jest.fn(), recovery: {}, observationStore: {}, health: { status: jest.fn(async () => ({ ready: false })), cacheInfo: jest.fn(() => ({})) }, clusterDrain: { set: jest.fn() }, lifecycle: { get: jest.fn() }, telemetry: { summary: jest.fn(), details: jest.fn() }, config: { elera: true }, intentState: {}, coldState: { drain: { isDraining: jest.fn(() => false), active: jest.fn(() => 0) }, clusterDrain: { set: jest.fn() } }, processController: {}, applyIntent: jest.fn(), environment: {}, log: {} });
  expect(result).toBeDefined();
  const options = result.options;
  expect(options.getConfig()).toEqual({ elera: true });
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
  options.bootstrap();
  await options.db.query('SELECT 1');
  await options.lifecycle.plan('bootstrap');
  await options.lifecycle.execute('bootstrap', { confirm: true });
  expect(query).toHaveBeenCalled();
});
