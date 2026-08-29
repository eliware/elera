import { expect, jest, test } from '@jest/globals';
import { handleTelemetryRoute } from '../../../src/api/routes/telemetry.mjs';

const context = (path, search = '', auth = { root: true }) => { const json = jest.fn(); return { method: 'GET', path, url: new URL(`http://localhost${path}${search}`), response: { json }, getTelemetry: () => ({ clients: 1 }), getTelemetryDetails: () => ({ application: 'app' }), auth, json }; };
test('returns telemetry summary', async () => { const value = context('/api/v1/telemetry'); expect(await handleTelemetryRoute(value)).toBe(true); expect(value.json).toHaveBeenCalledWith(200, expect.objectContaining({ operation: 'telemetry.summary' })); });
test('returns application detail and validates application', async () => { const detail = context('/api/v1/telemetry/details', '?application=app'); expect(await handleTelemetryRoute(detail)).toBe(true); expect(detail.json).toHaveBeenCalledWith(200, expect.objectContaining({ operation: 'telemetry.details' })); const missing = context('/api/v1/telemetry/details'); expect(await handleTelemetryRoute(missing)).toBe(true); expect(missing.json).toHaveBeenCalledWith(400, expect.objectContaining({ error: 'application is required' })); });
test('ignores non-telemetry requests', async () => { expect(await handleTelemetryRoute(context('/api/v1/status'))).toBe(false); expect(await handleTelemetryRoute({ ...context('/api/v1/telemetry'), method: 'POST' })).toBe(false); });
test('restricts scoped telemetry to the owning application', async () => { const scoped = context('/api/v1/telemetry/details', '?application=payments', { application: 'billing', scopes: ['app:admin'] }); expect(await handleTelemetryRoute(scoped)).toBe(true); expect(scoped.json).toHaveBeenCalledWith(403, expect.objectContaining({ error: expect.any(String) })); const owned = context('/api/v1/telemetry', '?application=billing', { application: 'billing', scopes: ['app:admin'] }); await handleTelemetryRoute(owned); expect(owned.json).toHaveBeenCalledWith(200, expect.objectContaining({ operation: 'telemetry.summary' })); });

test('authorizes root, wildcard, and telemetry-read access correctly', async () => {
  const root = context('/api/v1/telemetry', '', { root: true });
  await expect(handleTelemetryRoute(root)).resolves.toBe(true);
  const wildcard = context('/api/v1/telemetry', '?application=any', { scopes: ['*'] });
  await expect(handleTelemetryRoute(wildcard)).resolves.toBe(true);
  const scoped = context('/api/v1/telemetry/details', '?application=billing', { application: 'billing', scopes: ['telemetry:read'] });
  await expect(handleTelemetryRoute(scoped)).resolves.toBe(true);
  expect(scoped.json).toHaveBeenCalledWith(200, expect.objectContaining({ operation: 'telemetry.details' }));
});

test('rejects missing or unscoped telemetry authorization', async () => {
  const missing = context('/api/v1/telemetry', '', null);
  await handleTelemetryRoute(missing);
  expect(missing.json).toHaveBeenCalledWith(403, expect.anything());
  const wrongScope = context('/api/v1/telemetry', '', { application: 'billing', scopes: ['database:read'] });
  await handleTelemetryRoute(wrongScope);
  expect(wrongScope.json).toHaveBeenCalledWith(403, expect.anything());
});
