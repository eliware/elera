const nonNegative = (value) => Number.isFinite(Number(value)) ? Math.max(0, Number(value)) : 0;

export function normalizeTelemetryReport(report, receivedAt) {
  if (!report || report.type !== 'client.telemetry' || typeof report.application !== 'string' || !report.application) return undefined;
  return {
    application: report.application,
    queries: nonNegative(report.queries),
    failures: nonNegative(report.failures),
    retries: nonNegative(report.retries),
    reconnects: nonNegative(report.reconnects),
    failoverCount: nonNegative(report.failoverCount),
    inflight: nonNegative(report.inflight),
    avgLatencyMs: nonNegative(report.avgLatencyMs),
    receivedAt,
  };
}
