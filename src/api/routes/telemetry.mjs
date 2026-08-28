export async function handleTelemetryRoute({ method, path, url, response, getTelemetry, getTelemetryDetails }) {
  if (method !== 'GET' || (path !== '/api/v1/telemetry' && path !== '/api/v1/telemetry/details')) return false;
  if (path === '/api/v1/telemetry/details') {
    const application = url.searchParams.get('application');
    if (!application) { response.json(400, { ok: false, operation: 'telemetry.details', error: 'application is required' }); return true; }
    response.json(200, { ok: true, operation: 'telemetry.details', status: 'completed', data: await getTelemetryDetails(application) });
    return true;
  }
  response.json(200, { ok: true, operation: 'telemetry.summary', status: 'completed', data: await getTelemetry() });
  return true;
}
