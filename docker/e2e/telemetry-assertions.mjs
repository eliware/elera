export function assertNoLostQueries(probes, { minimum = 1, phase = 'test' } = {}) {
  const complete = probes.filter((probe) => probe.event === 'sql.probe' && !probe.error);
  if (complete.length < minimum) throw new Error(`${phase} captured too few successful queries`);
  if (probes.some((probe) => probe.error)) throw new Error(`${phase} captured query errors`);
  const byApplication = new Map();
  for (const probe of probes) if (Number.isInteger(Number(probe.sequence))) {
    const key = probe.application ?? '__default__';
    const sequences = byApplication.get(key) ?? [];
    sequences.push(Number(probe.sequence));
    byApplication.set(key, sequences);
  }
  for (const [application, sequences] of byApplication) {
    const unique = [...new Set(sequences)].sort((a, b) => a - b);
    if (unique.some((sequence, index) => index > 0 && sequence !== unique[index - 1] + 1)) throw new Error(`${phase} lost query sequence for ${application}`);
  }
  return { attempted: probes.length, completed: complete.length, lost: 0 };
}

export function assertQueryTelemetry(probe) {
  for (const field of ['startedAt', 'operation', 'selectedNode', 'retryCount', 'reconnectCount', 'latencyMs']) {
    if (!(field in probe)) throw new Error(`query telemetry missing ${field}`);
  }
  if (!Number.isFinite(Number(probe.latencyMs)) || Number(probe.latencyMs) < 0) throw new Error('query telemetry has invalid latency');
  return true;
}

export function assertWriterAssignments(probes, expectedApplications) {
  for (const application of expectedApplications) {
    const writers = new Set(probes.filter((probe) => probe.application === application).map((probe) => probe.writeNode).filter(Boolean));
    if (writers.size !== 1) throw new Error(`writer assignment did not converge for ${application}`);
  }
  return true;
}
