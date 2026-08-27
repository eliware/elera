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

export function createControlApi({ db, getStatus, getTraffic, setDrain, bootstrap, getConfig, getActiveIntent, leaseCredentials, metadata, environment = process.env, log, dataDir = environment.MARIADB_DATA_DIR ?? '/var/lib/mysql' }) {
  const token = environment.ROOT_TOKEN;
  const response = (target, request) => ({ json: (status, body) => json(target, status, { apiVersion: 'v1', requestId: request.headers?.['x-request-id'] ?? `req-${Date.now()}`, ...body }) });
  const handler = async (request, target) => {
    if (!request.url?.startsWith('/api/v1/')) return false;
    if (!tokenMatches(request, token)) { json(target, 401, { ok: false, error: 'authentication required' }); return true; }
    const out = response(target, request); const url = new URL(request.url, 'http://localhost');
    try {
      const context = { method: request.method, path: url.pathname, url, request, response: out, db, getStatus, getTraffic, setDrain, bootstrap, getConfig, getActiveIntent, metadata, environment, dataDir };
      if (await handleStatusRoute(context) || await handleIntentRoute(context) || await handleAccountRoute(context) || await handleClusterRoute(context) || await handleTrafficRoute(context) || await handleInitializationRoute(context) || (metadata && await handleMetadataRoute(context))) return true;
      if (request.method === 'POST' && url.pathname === '/api/v1/credentials/lease') {
        const leaseRequest = validateCredentialLeaseRequest(await readBody(request));
        if (typeof leaseCredentials !== 'function') { out.json(501, { ok: false, operation: 'credentials.lease', error: 'credential leasing is not configured' }); return true; }
        const result = await leaseCredentials(leaseRequest);
        out.json(200, { ok: true, operation: 'credentials.lease', status: 'completed', data: connectionBundleFromConfig(result) }); return true;
      }
      out.json(404, { ok: false, error: 'endpoint not found' }); return true;
    } catch (error) { log?.error('Control API request failed', { error, method: request.method, url: request.url }); json(target, error.statusCode ?? 500, { ok: false, error: error.message ?? String(error) }); return true; }
  };
  return { handler };
}
