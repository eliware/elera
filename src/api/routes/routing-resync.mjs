/* istanbul ignore file -- HTTP route adapter is covered by endpoint contracts. */
export function handleRoutingResyncRoute({ method, path, url, response, getEvent } = {}) {
  if (method !== 'GET' || path !== '/api/v1/routing/resync') return false;
  const event = getEvent(url.searchParams.get('application') ?? 'default');
  response.json(200, { ok: true, operation: 'routing.resync', data: event });
  return true;
}
