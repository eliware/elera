const canRead = (auth, application) => {
  if (auth?.root || auth?.scopes?.includes('*')) return true;
  if (!auth?.scopes?.includes('telemetry:read') && !auth?.scopes?.includes('app:admin')) return false;
  return Boolean(auth.application && (!application || auth.application === application));
};

export async function handleTelemetryRoute({ method, path, url, response, getTelemetry, getTelemetryDetails, auth }) {
  if (method !== 'GET' || (path !== '/api/v1/telemetry' && path !== '/api/v1/telemetry/details')) return false;
  const requestedApplication = url.searchParams.get('application');
  if (!canRead(auth, requestedApplication)) { response.json(403, { ok: false, operation: 'telemetry', error: 'telemetry is not authorized for this application' }); return true; }
  if (path === '/api/v1/telemetry/details') {
    const application = requestedApplication ?? auth?.application;
    if (!application) { response.json(400, { ok: false, operation: 'telemetry.details', error: 'application is required' }); return true; }
    response.json(200, { ok: true, operation: 'telemetry.details', status: 'completed', data: await getTelemetryDetails(application) });
    return true;
  }
  response.json(200, { ok: true, operation: 'telemetry.summary', status: 'completed', data: requestedApplication && getTelemetryDetails ? await getTelemetryDetails(requestedApplication) : await getTelemetry() });
  return true;
}
