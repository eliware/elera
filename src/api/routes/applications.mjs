import { readBody } from '../http.mjs';

export async function handleApplicationRoute({ method, path, request, response, auth, applications }) {
  if (!applications) return false;
  if (method === 'POST' && path === '/api/v1/applications') {
    if (!auth?.root) return false;
    const body = await readBody(request);
    response.json(201, { ok: true, operation: 'application.create', data: await applications.create({ name: body.name ?? body.application }) });
    return true;
  }
  if (method === 'POST' && path === '/api/v1/app-admin/tokens') {
    if (!auth?.root) return false;
    const body = await readBody(request);
    response.json(201, { ok: true, operation: 'app-admin.create', data: await applications.issueAdminToken({ application: body.application, tokenName: body.name ?? body.tokenName }) });
    return true;
  }
  return false;
}
