import { expect, test } from '@jest/globals';
import { normalizeTelemetryReport } from '../src/telemetry/normalize.mjs';

test('normalizes valid counters and rejects invalid reports', () => { expect(normalizeTelemetryReport({ type: 'client.telemetry', application: 'app', queries: '2', failures: -1, avgLatencyMs: 'bad' }, 1000)).toMatchObject({ application: 'app', queries: 2, failures: 0, avgLatencyMs: 0, receivedAt: 1000 }); expect(normalizeTelemetryReport(null, 1000)).toBeUndefined(); expect(normalizeTelemetryReport({ type: 'bad', application: 'app' }, 1000)).toBeUndefined(); expect(normalizeTelemetryReport({ type: 'client.telemetry', application: '' }, 1000)).toBeUndefined(); });
