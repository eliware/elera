import { expect, jest, test } from '@jest/globals';

const captured = {};
let streamOptions;
let managedAuth;
let firstManagedAuth;
jest.unstable_mockModule('../../src/health.mjs', () => ({ createHealthService: jest.fn((options) => { captured.health = options; return { status: () => ({}), cacheInfo: () => ({}) }; }) }));
jest.unstable_mockModule('../../src/runtime/composition.mjs', () => ({ createSupervisorComposition: jest.fn((options) => { captured.domain = options; managedAuth = jest.fn(); return { intentState: { apply: jest.fn() }, observationStore: {}, metadata: {}, managed: { authenticate: managedAuth }, applications: {}, managedAccounts: {}, reconciler: {}, artifactStore: {} }; }) }));
jest.unstable_mockModule('../../src/runtime/routing-composition.mjs', () => ({ createRoutingComposition: jest.fn((options) => { captured.routing = options; return { routingAssignments: {}, sharedRoutingAssignments: {}, routingEnvironment: {}, routingBundles: {}, routingEvent: jest.fn(), routingBus: {} }; }) }));
jest.unstable_mockModule('../../src/api/routing-stream.mjs', () => ({ createRoutingStream: jest.fn((options) => { captured.stream = options; return { upgrade: jest.fn() }; }) }));
jest.unstable_mockModule('../../src/runtime/traffic-wiring.mjs', () => ({ createSupervisorTraffic: jest.fn(({ setDrained }) => ({ drain: { isDraining: () => false }, sqlQuiesce: {}, clusterDrain: {}, getDrained: () => false, setDrained })) }));
jest.unstable_mockModule('../../src/runtime/control-composition.mjs', () => ({ createSupervisorControlComposition: jest.fn((options) => { captured.control = options; return { handler: jest.fn() }; }) }));
jest.unstable_mockModule('../../src/runtime/probe-wiring.mjs', () => ({ createSupervisorProbes: jest.fn((options) => { captured.probes = options; return {}; }) }));
jest.unstable_mockModule('../../src/runtime/lifecycle-composition.mjs', () => ({ createSupervisorLifecycle: jest.fn((options) => { captured.lifecycle = options; return { errors: [], shutdown: jest.fn(), signals: { shutdown: jest.fn() } }; }) }));
jest.unstable_mockModule('../../src/runtime/server-lifecycle.mjs', () => ({ closeServer: jest.fn() }));

const { createSupervisorEntryComposition } = await import('../../src/runtime/entry-composition.mjs');

test('composes collaborators and forwards live runtime dependencies', async () => {
  const servers = [];
  let database;
  let drained = false;
  const telemetry = { summary: () => ({}), start: jest.fn() };
  const recoveryState = { snapshot: () => ({}) };
  const lifecycle = { get: () => 'running' };
  const result = createSupervisorEntryComposition({
    config: { dataDir: 'tests/.tmp', timeoutMs: 100, elera: false, clusterSize: 1 },
    identity: { name: 'node' }, lifecycle, telemetry, recoveryState, recovery: {}, log: {},
    environment: { ELERA_CLUSTER_SIZE: '1', ROOT_TOKEN: 'root' }, getDb: () => database,
    setDrained: (value) => { drained = value; }, getDrained: () => drained,
    getTimers: () => ['peer', 'routing'], getMariaProcess: () => ({ start: jest.fn(), stop: jest.fn() }),
    getColdState: () => ({ drain: {}, clusterDrain: {} }), applyIntent: jest.fn(), servers,
  });
  expect(result.health).toBeDefined();
  expect(result.routingEvent).toEqual(expect.any(Function));
  streamOptions = captured.stream;
  firstManagedAuth = managedAuth;
  expect(servers).toHaveLength(1);
  expect(captured.control.coldState).toEqual(expect.objectContaining({ drain: {}, clusterDrain: {}, coldEvidence: expect.any(Function) }));
  result.lifecycleWiring({ errors: [] });
  expect(captured.lifecycle.getTimers()).toEqual(['peer', 'routing']);
  expect(captured.probes.getStatus()).toEqual({});
  expect(captured.probes.isDraining()).toBe(false);
  expect(captured.probes.isShuttingDown()).toBe(false);
  captured.health.getTelemetry(); captured.health.getRecoveryState();
  captured.health.db.query('select'); captured.health.db.health();
  captured.domain.query('select'); captured.routing.query('select'); await captured.routing.resolveAddress('localhost');
  captured.control.processController.start('arg'); captured.probes.controlHandler({}, {}); captured.probes.upgradeHandler({}, {}, {});
  expect(await captured.control.applyIntent({})).toBeUndefined();
  database = { query: jest.fn(), health: jest.fn() };
  expect(captured.control.db.query('select')).toBeUndefined();
  expect(result.traffic.getDrained()).toBe(false);
  expect(drained).toBe(false);
  const defaults = createSupervisorEntryComposition({ config: { dataDir: 'tests/.tmp' }, identity: {}, lifecycle, telemetry, recoveryState, recovery: {}, log: {}, getDb: () => undefined, setDrained: () => {}, getDrained: () => false, getTimers: () => [] });
  expect(defaults).toBeDefined();
  captured.control.applyIntent({});
});

test('keeps root and managed-token authorization behavior', async () => {
  firstManagedAuth.mockResolvedValueOnce({ application: 'app' }).mockResolvedValueOnce({ application: 'other' });
  const options = streamOptions;
  expect(await options.authorize()).toBe(false);
  expect(await options.authorize('root', 'app')).toBe(true);
  expect(await options.authorize('token', 'app')).toEqual({ application: 'app' });
  expect(await options.authorize('token', 'app')).toBe(false);
});
