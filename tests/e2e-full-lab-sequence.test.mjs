import { runFullLab } from '../docker/e2e/full-lab-sequence.mjs';

const probes = ['app-a', 'app-b', 'app-c'].map((application, index) => ({
  event: 'sql.probe', application, startedAt: new Date().toISOString(), operation: 'read',
  selectedNode: `elera-${index}`, writeNode: `elera-${index}`, retryCount: 0, reconnectCount: 0, latencyMs: 1,
}));
const lab = {
  assertReady: async () => {}, assertNotReady: async () => {}, assertClusterHealthy: async () => {},
  shutdown: async () => {}, signal: async () => {}, stopMembers: async () => {}, assertLastSurvivor: async () => {},
  startMembers: async () => {}, clusterReady: async () => true, stop: async () => {},
  assertExcluded: async () => {}, restart: async () => {},
};
const client = { waitForFailureover: async () => ({ probes }), waitForClusterUnavailable: async () => ({ probes }), snapshot: async () => ({ probes: probes.map((probe) => ({ ...probe, selectedNode: 'elera-2' })) }), bundle: async () => ({ bundleVersion: '1' }) };

function adapters(order) {
  const mark = (name) => async () => { order.push(name); };
  return {
    initialize: mark('initialize'), assertHealthy: mark('healthy'), runCli: async (args) => args[0] === 'token-create' ? { data: { token: `${args[1]}-token` } } : { ok: true },
    assertIndependentWriters: mark('writers'), startApplication: async (application) => ({ application, stop: mark(`stop:${application.application}`) }), restoreCluster: mark('restore'),
    backupRestore: mark('backup-restore'), collectProbes: async () => probes, applicationDurationMs: 0,
    routingFallback: { stream: { connect: async ({ onUpdate }) => onUpdate({ type: 'routing.update' }) }, rest: { bundle: async () => ({ bundleVersion: '1' }) } },
    lab, standaloneClient: client, client, recoveryClient: { coldBootstrapPlan: async () => ({ data: { eligible: true, operationId: 'op', candidate: { node: 'elera-0' } } }), coldBootstrap: mark('recover') }, dataDirectoryLab: { start: async () => ({ started: false, reason: 'refused' }) },
  };
}

test('runs the full lab phases in explicit order without Docker dependencies', async () => {
  const order = [];
  const result = await runFullLab({ adapters: adapters(order), environment: { ROOT_TOKEN: 'root' }, applications: ['app-a', 'app-b', 'app-c'], logger: (message) => order.push(message) });
  expect(result.phases).toEqual(['initialize', 'metadata', 'routing', 'node-failure', 'shutdown', 'data-directory-safety', 'backup-restore', 'telemetry']);
  expect(result.dataDirectoryCases).toHaveLength(7);
  expect(result.probeCount).toBe(3);
  expect(order[0]).toBe('phase:initialize');
});

test('rejects an incomplete adapter boundary before executing work', async () => {
  await expect(runFullLab({ adapters: {}, environment: {} })).rejects.toThrow('missing lab adapter');
});

test('uses default applications, duration, and logger when omitted', async () => {
  const order = [];
  const result = await runFullLab({ adapters: adapters(order), environment: { ROOT_TOKEN: 'root' } });
  expect(result.applications).toHaveLength(3);
  expect(result.phases).toContain('telemetry');
});

test('reports missing named adapter requirements', async () => {
  const order = [];
  const complete = adapters(order);
  delete complete.dataDirectoryLab;
  await expect(runFullLab({ adapters: complete })).rejects.toThrow('dataDirectoryLab');
});
