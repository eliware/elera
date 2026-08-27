/* istanbul ignore file -- HTTP composition boundary is covered by endpoint contract tests. */
import { connectionBundleFromConfig } from './connection-bundle.mjs';
import { validateCredentialLeaseRequest } from './routing-policy.mjs';
import { json, readBody } from './api/http.mjs';
import { tokenMatches } from './api/authentication.mjs';
import { handleAccountRoute } from './api/routes/accounts.mjs';
import { handleClusterRoute } from './api/routes/cluster.mjs';
import { handleStatusRoute } from './api/routes/status.mjs';
import { handleTrafficRoute } from './api/routes/traffic.mjs';
import { handleInitializationRoute } from './api/routes/initialization.mjs';
import { handleIntentRoute } from './api/routes/intent.mjs';
import { handleMetadataRoute } from './api/routes/metadata.mjs';
import { handleObservationRoute } from './api/routes/observations.mjs';
import { handleManagedRoute } from './api/routes/managed.mjs';

export function createControlApi({ db, getStatus, getTraffic, setDrain, bootstrap, lifecycle, getConfig, getActiveIntent, leaseCredentials, metadata, managed, observations = [], observationStore, environment = process.env, log, dataDir = environment.MARIADB_DATA_DIR ?? '/var/lib/mysql' }) {
  const token = environment.ROOT_TOKEN;
  const response = (target, request) => ({ json: (status, body) => json(target, status, { apiVersion: 'v1', requestId: request.headers?.['x-request-id'] ?? `req-${Date.now()}`, ...body }) });
  const handler = async (request, target) => {
    if (!request.url?.startsWith('/api/v1/')) return false;
    const supplied = request.headers?.authorization?.match(/^Bearer\s+(.+)$/i)?.[1];
    const scoped = supplied && await metadata?.authenticate?.(supplied);
    if (!tokenMatches(request, token) && !scoped) { json(target, 401, { ok: false, error: 'authentication required' }); return true; }
    const out = response(target, request); const url = new URL(request.url, 'http://localhost');
    try {
      const context = { method: request.method, path: url.pathname, url, request, response: out, db, getStatus, getTraffic, setDrain, bootstrap, lifecycle, getConfig, getActiveIntent, metadata, managed, auth: tokenMatches(request, token) ? { root: true, scopes: ['*'] } : scoped, observations, observationStore, environment, dataDir };
      if (await handleStatusRoute(context) || await handleIntentRoute(context) || await handleAccountRoute(context) || await handleClusterRoute(context) || await handleTrafficRoute(context) || await handleInitializationRoute(context) || (metadata && await handleMetadataRoute(context)) || await handleObservationRoute(context) || await handleManagedRoute(context)) return true;
      if (request.method === 'POST' && url.pathname === '/api/v1/credentials/lease') {
        const leaseRequest = validateCredentialLeaseRequest(await readBody(request));
        if (typeof leaseCredentials !== 'function') { out.json(501, { ok: false, operation: 'credentials.lease', error: 'credential leasing is not configured' }); return true; }
        const result = await leaseCredentials(leaseRequest);
        out.json(200, { ok: true, operation: 'credentials.lease', status: 'completed', data: connectionBundleFromConfig(result) }); return true;
      }
      if (request.method === 'POST' && (url.pathname === '/api/v1/credentials/refresh' || url.pathname === '/api/v1/credentials/revoke')) {
        const body = await readBody(request); if (typeof managed?.lease !== 'function') { out.json(501, { ok: false, error: 'credential management is not configured' }); return true; }
        if (url.pathname.endsWith('/revoke')) { const result = await managed.revokeIdentity(body.identity); out.json(200, { ok: true, operation: 'credentials.revoke', data: result }); return true; }
        const result = await managed.lease(body); out.json(200, { ok: true, operation: 'credentials.refresh', status: 'completed', data: connectionBundleFromConfig(result) }); return true;
      }
      out.json(404, { ok: false, error: 'endpoint not found' }); return true;
    } catch (error) { log?.error('Control API request failed', { error, method: request.method, url: request.url }); json(target, error.statusCode ?? 500, { ok: false, error: error.message ?? String(error) }); return true; }
  };
  return { handler };
}
