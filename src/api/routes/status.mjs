export async function handleStatusRoute({ method, path, response, getStatus, getConfig, environment }) {
  if (method === 'GET' && path === '/api/v1/status') {
    response.json(200, { ok: true, operation: 'status', status: 'completed', data: await getStatus() }); return true;
  }
  if (method === 'GET' && path === '/api/v1/config') {
    const data = typeof getConfig === 'function' ? await getConfig() : { elera: false, database: 'elera_meta', primaryHost: null, balancedHost: null };
    response.json(200, { ok: true, operation: 'config', status: 'completed', data }); return true;
  }
  return false;
}
