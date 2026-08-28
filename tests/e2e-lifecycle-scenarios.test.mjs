import { assertDataDirectoryRefusal, unsafeDataDirectoryCases } from '../docker/e2e/data-directory-cases.mjs';
import { assertNoLostQueries, assertQueryTelemetry, assertWriterAssignments } from '../docker/e2e/telemetry-assertions.mjs';
import { assertWithinTerminationBudget, runLastSurvivorShutdown, runStandaloneShutdown, runTotalClusterRecovery, validateProbeSet } from '../docker/e2e/lifecycle-scenarios.mjs';

const healthyLab = () => ({ assertReady: async () => {}, assertNoAlternateRoute: async () => {}, assertNotReady: async () => {}, assertClusterHealthy: async () => {}, signal: async () => {}, stopMembers: async () => {}, assertLastSurvivor: async () => {}, startMembers: async () => {}, clusterReady: async () => true });
const probes = (application = 'app', writeNode = 'elera-0') => [{ event: 'sql.probe', application, startedAt: new Date().toISOString(), operation: 'read', selectedNode: writeNode, writeNode, retryCount: 0, reconnectCount: 0, latencyMs: 2 }];

test('covers standalone shutdown with no alternate route', async () => {
  await expect(runStandaloneShutdown({ lab: healthyLab(), client: { waitForFailureover: async () => ({ probes: probes() }) } })).resolves.toMatchObject({ lost: 0 });
  await expect(runStandaloneShutdown({ lab: healthyLab(), probes: probes() })).resolves.toMatchObject({ lost: 0 });
});

test('sends SIGTERM to the standalone node', async () => {
  const signals = [];
  const lab = { ...healthyLab(), signal: async (...args) => signals.push(args) };
  await runStandaloneShutdown({ lab, probes: probes() });
  expect(signals).toEqual([['standalone', 'SIGTERM']]);
});

test('covers final surviving cluster node shutdown', async () => {
  await expect(runLastSurvivorShutdown({ lab: healthyLab(), client: { waitForClusterUnavailable: async () => ({ probes: probes() }) } })).resolves.toMatchObject({ state: 'cluster-unavailable', lost: 0 });
  await expect(runLastSurvivorShutdown({ lab: healthyLab(), probes: probes() })).resolves.toMatchObject({ state: 'cluster-unavailable', lost: 0 });
});

test('sends SIGTERM to the final surviving node', async () => {
  const signals = [];
  const lab = { ...healthyLab(), signal: async (...args) => signals.push(args) };
  await runLastSurvivorShutdown({ lab, probes: probes() });
  expect(signals).toEqual([['elera-2', 'SIGTERM']]);
});

test('requires an explicit recovery candidate for total outage', async () => {
  const lab = healthyLab();
  await expect(runTotalClusterRecovery({ lab, client: { coldBootstrapPlan: async () => ({ data: { eligible: false, reason: 'ambiguous seqno' } }) } })).rejects.toThrow('ambiguous seqno');
  await expect(runTotalClusterRecovery({ lab, client: { coldBootstrapPlan: async () => ({ data: { eligible: true, candidate: { node: 'elera-1' } } }), coldBootstrap: async () => {} } })).resolves.toMatchObject({ candidate: 'elera-1', recovered: true });
  await expect(runTotalClusterRecovery({ lab, client: { coldBootstrapPlan: async () => ({ data: { eligible: true } }) } })).rejects.toThrow('did not identify a candidate');
  await expect(runTotalClusterRecovery({ lab: { ...lab, clusterReady: async () => false }, client: { coldBootstrapPlan: async () => ({ data: { eligible: true, candidate: { node: 'elera-1' } } }), coldBootstrap: async () => {} } })).rejects.toThrow('did not become true');
});

test('rejects every unsafe data-directory case closed', async () => {
  for (const caseName of unsafeDataDirectoryCases) await expect(assertDataDirectoryRefusal({ lab: { start: async () => ({ started: false, reason: `${caseName} refused` }) }, caseName })).resolves.toHaveProperty('started', false);
});

test('validates per-query telemetry and per-application writers', () => {
  expect(validateProbeSet([...probes('app-a', 'elera-0'), ...probes('app-b', 'elera-1')], ['app-a', 'app-b'])).toBe(true);
});

test('enforces the Kubernetes termination budget', () => {
  expect(assertWithinTerminationBudget({ startedAt: 1000, finishedAt: 90000 })).toMatchObject({ withinBudget: true, elapsedMs: 89000 });
  expect(() => assertWithinTerminationBudget({ startedAt: 0, finishedAt: 90001 })).toThrow('exceeded termination budget');
  expect(() => assertWithinTerminationBudget({ startedAt: 'bad', finishedAt: 1 })).toThrow('timestamps are invalid');
});

test('rejects incomplete telemetry and lost queries', () => {
  expect(() => assertNoLostQueries([{ event: 'sql.error', error: 'offline' }])).toThrow('too few');
  expect(() => assertNoLostQueries([...probes(), { event: 'sql.error', error: 'offline' }])).toThrow('query errors');
  expect(() => assertQueryTelemetry({})).toThrow('missing startedAt');
  expect(() => assertQueryTelemetry({ startedAt: '', operation: 'read', selectedNode: 'n', retryCount: 0, reconnectCount: 0, latencyMs: -1 })).toThrow('invalid latency');
  expect(() => assertWriterAssignments([{ application: 'app', writeNode: 'a' }, { application: 'app', writeNode: 'b' }], ['app'])).toThrow('did not converge');
  expect(() => assertNoLostQueries([{ event: 'sql.probe', application: 'app', sequence: 1 }, { event: 'sql.probe', application: 'app', sequence: 3 }])).toThrow('lost query sequence');
});

test('rejects unknown data-directory cases', async () => {
  await expect(assertDataDirectoryRefusal({ lab: {}, caseName: 'unknown' })).rejects.toThrow('unknown data-directory case');
  await expect(assertDataDirectoryRefusal({ lab: { start: async () => ({ started: true, reason: 'unsafe' }) }, caseName: 'empty' })).rejects.toThrow('accepted');
  await expect(assertDataDirectoryRefusal({ lab: { start: async () => ({ started: false, initialized: true, reason: 'unsafe' }) }, caseName: 'empty' })).rejects.toThrow('accepted');
});
test('requires a diagnostic when an unsafe directory is accepted without one', async () => {
  await expect(assertDataDirectoryRefusal({ lab: { start: async () => ({ started: false }) }, caseName: 'empty' })).rejects.toThrow('diagnostic');
});
test('rejects a data directory that reports initialization', async () => {
  await expect(assertDataDirectoryRefusal({ lab: { start: async () => ({ started: false, initialized: true, reason: 'already initialized' }) }, caseName: 'stale' })).rejects.toThrow('accepted');
});
