import { assertDataDirectoryRefusal, unsafeDataDirectoryCases } from './data-directory-cases.mjs';
import { runLastSurvivorShutdown, runStandaloneShutdown, runTotalClusterRecovery, validateProbeSet } from './lifecycle-scenarios.mjs';
import { assertWriterReassignment, exerciseApplications, provisionSimulatedApplications } from './multi-applications.mjs';
import { verifyNodeLoss, verifyRoutingFallback, verifyServiceRestart, verifyTwoNodeLoss } from './transport-scenarios.mjs';

const defaultApplications = Object.freeze(['app-a', 'app-b', 'app-c']);

/**
 * Execute the complete lab contract through injected adapters. The adapters
 * keep Docker/Compose concerns at the boundary and make this sequence unit
 * testable without starting a lab.
 */
export async function runFullLab({ adapters, environment, applications = defaultApplications, logger = () => {} } = {}) {
  assertAdapters(adapters);
  const log = (message) => logger?.(message);
  const evidence = { phases: [], applications: [], failures: [], dataDirectoryCases: [] };

  await phase(evidence, 'initialize', async () => {
    await adapters.initialize();
    await adapters.assertHealthy();
  }, log);

  await phase(evidence, 'metadata', async () => {
    evidence.applications = await provisionSimulatedApplications({ runCli: adapters.runCli, environment, applications });
    await adapters.assertIndependentWriters(evidence.applications);
  }, log);

  await phase(evidence, 'routing', async () => {
    await verifyRoutingFallback(adapters.routingFallback);
    await exerciseApplications({ applications: evidence.applications, start: adapters.startApplication, durationMs: adapters.applicationDurationMs ?? 5000 });
  }, log);

  await phase(evidence, 'node-failure', async () => {
    await verifyNodeLoss({ client: adapters.client, lab: adapters.lab, node: 'elera-0' });
    await adapters.restoreCluster();
    await verifyTwoNodeLoss({ client: adapters.client, lab: adapters.lab });
    await adapters.restoreCluster();
    if (adapters.writerAssignments) assertWriterReassignment(...adapters.writerAssignments, 'elera-0');
    await verifyServiceRestart({ client: adapters.client, lab: adapters.lab, service: 'supervisor' });
    await verifyServiceRestart({ client: adapters.client, lab: adapters.lab, service: 'mariadb' });
  }, log);

  await phase(evidence, 'shutdown', async () => {
    await runStandaloneShutdown({ lab: adapters.lab, client: adapters.standaloneClient });
    await runLastSurvivorShutdown({ lab: adapters.lab, client: adapters.client });
    await runTotalClusterRecovery({ lab: adapters.lab, client: adapters.recoveryClient });
  }, log);

  await phase(evidence, 'data-directory-safety', async () => {
    for (const caseName of unsafeDataDirectoryCases) {
      evidence.dataDirectoryCases.push(await assertDataDirectoryRefusal({ lab: adapters.dataDirectoryLab, caseName }));
    }
  }, log);

  await phase(evidence, 'backup-restore', async () => {
    await adapters.backupRestore();
  }, log);

  await phase(evidence, 'telemetry', async () => {
    const probes = await adapters.collectProbes();
    validateProbeSet(probes, applications);
    evidence.probeCount = probes.length;
  }, log);
  return evidence;
}

function assertAdapters(adapters = {}) {
  const required = ['initialize', 'assertHealthy', 'runCli', 'assertIndependentWriters', 'startApplication', 'restoreCluster', 'backupRestore', 'collectProbes'];
  for (const name of required) if (typeof adapters[name] !== 'function') throw new TypeError(`missing lab adapter: ${name}`);
  for (const name of ['routingFallback', 'lab', 'standaloneClient', 'client', 'recoveryClient', 'dataDirectoryLab']) if (!adapters[name]) throw new TypeError(`missing lab adapter: ${name}`);
}

async function phase(evidence, name, operation, log) {
  log(`phase:${name}`);
  await operation();
  evidence.phases.push(name);
}
