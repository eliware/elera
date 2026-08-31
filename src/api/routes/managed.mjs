import { readBody } from '../http.mjs';

const allowed = (auth, scope, application) => auth?.root || auth?.scopes?.includes(scope) || (auth?.scopes?.includes('app:admin') && (!application || auth.application === application));
const send = (response, status, body) => response.json(status, body);

export async function handleManagedRoute({ method, path, request, response, managed, auth }) {
  if (!managed) return false;
  if (method === 'GET' && path === '/api/v1/metadata/export') { if (!allowed(auth, 'metadata:read')) return false; send(response, 200, { ok: true, operation: 'metadata.export', data: { databases: await managed.listDatabases(), identities: await managed.listIdentities() } }); return true; }
  if (method === 'GET' && path === '/api/v1/databases') { if (!allowed(auth, 'database:read')) return false; send(response, 200, { ok: true, data: await managed.listDatabases() }); return true; }
  if (method === 'POST' && path === '/api/v1/databases') { const body = await readBody(request); if (!allowed(auth, 'database:provision', body.application)) return false; send(response, 200, { ok: true, operation: 'database.provision', data: await managed.createDatabase({ application: body.application, databaseName: body.database ?? body.databaseName }) }); return true; }
  const deleteMatch = path.match(/^\/api\/v1\/databases\/([^/]+)\/delete$/);
  if (method === 'POST' && deleteMatch) { if (!allowed(auth, 'database:delete')) return false; const body = await readBody(request); send(response, body.dryRun === true ? 200 : 202, { ok: true, operation: 'database.delete', data: await managed.deleteDatabase({ ...body, databaseId: decodeURIComponent(deleteMatch[1]) }) }); return true; }
  if (method === 'GET' && path === '/api/v1/identities') { if (!allowed(auth, 'identity:read')) return false; const body = await readBody(request).catch(() => ({})); const application = new URL(request.url, 'http://localhost').searchParams.get('application') ?? body.application; send(response, 200, { ok: true, data: await managed.listIdentities(application) }); return true; }
  if (method === 'POST' && path === '/api/v1/identities') { const body = await readBody(request); if (!allowed(auth, 'identity:provision', body.application)) return false; send(response, 200, { ok: true, operation: 'identity.provision', data: await managed.createIdentity({ application: body.application, databaseName: body.database, identity: body.identity, purpose: body.purpose, grants: body.grants }) }); return true; }
  if (method === 'POST' && path === '/api/v1/identities/rotate') { if (!allowed(auth, 'identity:rotate')) return false; const body = await readBody(request); send(response, 200, { ok: true, operation: 'identity.rotate', data: await managed.rotateIdentity(body.identity) }); return true; }
  if (method === 'POST' && path === '/api/v1/tokens') { const body = await readBody(request); if (!allowed(auth, 'token:create', body.application)) return false; if (!Array.isArray(body.scopes)) throw Object.assign(new Error('explicit token scopes are required'), { statusCode: 400 }); send(response, 200, { ok: true, operation: 'token.create', data: await managed.issueToken(body) }); return true; }
  if (method === 'POST' && path === '/api/v1/tokens/revoke') { if (!allowed(auth, 'token:revoke')) return false; const body = await readBody(request); send(response, 200, { ok: true, operation: 'token.revoke', data: await managed.revokeToken(body.name) }); return true; }
  if (method === 'POST' && path === '/api/v1/identities/revoke') { if (!allowed(auth, 'identity:revoke')) return false; const body = await readBody(request); send(response, 200, { ok: true, operation: 'identity.revoke', data: await managed.revokeIdentity(body.identity) }); return true; }
  return false;
}
