import { assertNoLostQueries, assertQueryTelemetry, assertWriterAssignments } from './telemetry-assertions.mjs';

async function waitFor(condition, { attempts = 60, delay = async () => {} } = {}) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if (await condition()) return;
    await delay(attempt);
  }
  throw new Error('condition did not become true');
}

export async function runStandaloneShutdown({ lab, client = {}, probes = [] } = {}) {
  await lab.assertReady('standalone');
  await lab.assertNoAlternateRoute?.('standalone');
  await lab.signal('standalone', 'SIGTERM');
  await lab.assertNotReady('standalone');
  const result = await client.waitForFailureover?.() ?? { probes };
  return assertNoLostQueries(result.probes ?? probes, { phase: 'standalone shutdown' });
}

export async function runLastSurvivorShutdown({ lab, client = {}, probes = [] } = {}) {
  await lab.assertClusterHealthy();
  await lab.stopMembers(['elera-0', 'elera-1']);
  await lab.assertLastSurvivor('elera-2');
  await lab.signal('elera-2', 'SIGTERM');
  const result = await client.waitForClusterUnavailable?.() ?? { probes };
  return { ...assertNoLostQueries(result.probes ?? probes, { phase: 'last survivor shutdown' }), state: 'cluster-unavailable' };
}

export async function runTotalClusterRecovery({ lab, client } = {}) {
  await lab.assertClusterHealthy();
  await lab.stopMembers(['elera-0', 'elera-1', 'elera-2']);
  const plan = await client.coldBootstrapPlan();
  if (plan.data?.eligible !== true) throw new Error(`recovery refused: ${plan.data?.reason ?? 'no eligible candidate'}`);
  if (!plan.data.candidate?.node) throw new Error('recovery plan did not identify a candidate');
  await client.coldBootstrap({ confirm: true, idempotencyKey: plan.data.operationId });
  await lab.startMembers(['elera-1', 'elera-2']);
  await waitFor(() => lab.clusterReady());
  return { candidate: plan.data.candidate.node, recovered: true };
}

export function validateProbeSet(probes, applications) {
  probes.forEach(assertQueryTelemetry);
  assertNoLostQueries(probes, { phase: 'probe set' });
  assertWriterAssignments(probes, applications);
  return true;
}

export function assertWithinTerminationBudget({ startedAt, finishedAt, budgetMs = 90000 } = {}) {
  const elapsedMs = Number(finishedAt) - Number(startedAt);
  if (!Number.isFinite(elapsedMs) || elapsedMs < 0) throw new Error('shutdown timestamps are invalid');
  if (elapsedMs > budgetMs) throw new Error(`shutdown exceeded termination budget by ${elapsedMs - budgetMs}ms`);
  return { elapsedMs, budgetMs, withinBudget: true };
}
