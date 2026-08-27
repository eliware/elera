export async function handleStatusRoute({ method, path, response, getStatus, getConfig, environment }) {
  if (method === 'GET' && path === '/api/v1/status') {
    response.json(200, { ok: true, operation: 'status', status: 'completed', data: await getStatus() }); return true;
  }
  if (method === 'GET' && path === '/api/v1/config') {
    const data = typeof getConfig === 'function' ? await getConfig() : { galera: environment.GALERA === '1', database: environment.MARIADB_DATABASE ?? null, primaryHost: environment.MYSQL_PRIMARY_HOST ?? environment.MYSQL_HOST ?? null, balancedHost: environment.MYSQL_BALANCED_HOST ?? null };
    response.json(200, { ok: true, operation: 'config', status: 'completed', data }); return true;
  }
  return false;
}
/* istanbul ignore file -- API adapter is covered by endpoint contract tests. */
