import { expect, test } from '@jest/globals';
import { normalizeTelemetryReport } from '../../src/telemetry/normalize.mjs';

test('normalizes valid counters and rejects invalid reports', () => { expect(normalizeTelemetryReport({ type: 'client.telemetry', application: 'app', queries: '2', failures: -1, avgLatencyMs: 'bad' }, 1000)).toMatchObject({ application: 'app', queries: 2, failures: 0, avgLatencyMs: 0, receivedAt: 1000 }); expect(normalizeTelemetryReport(null, 1000)).toBeUndefined(); expect(normalizeTelemetryReport({ type: 'bad', application: 'app' }, 1000)).toBeUndefined(); expect(normalizeTelemetryReport({ type: 'client.telemetry', application: '' }, 1000)).toBeUndefined(); });
test('normalizes optional fields and clamps non-finite counters', () => {
  expect(normalizeTelemetryReport({ type: 'client.telemetry', application: 'app', credentialName: 'id', database: 'db', scopes: ['read'], retries: Infinity, reconnects: undefined, sentAt: 123 }, 2000)).toMatchObject({ credentialName: 'id', database: 'db', scopes: ['read'], retries: 0, reconnects: 0, sentAt: undefined });
  expect(normalizeTelemetryReport({ type: 'client.telemetry', application: 'app', scopes: 'read', queries: -3, reconnectDelayMs: -1, failoverCount: 'x', inflight: 2, avgLatencyMs: 4 }, 2000)).toMatchObject({ scopes: undefined, queries: 0, reconnectDelayMs: 0, failoverCount: 0, inflight: 2, avgLatencyMs: 4 });
});
test('preserves a valid telemetry timestamp', () => {
  expect(normalizeTelemetryReport({ type: 'client.telemetry', application: 'app', sentAt: '2026-08-29T00:00:00Z' }, 2000).sentAt).toBe('2026-08-29T00:00:00Z');
});
