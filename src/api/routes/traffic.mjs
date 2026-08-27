export async function handleTrafficRoute({ method, path, request, response, getTraffic, setDrain }) {
  if (method === 'GET' && path === '/api/v1/traffic/status') { response.json(200, { ok: true, operation: 'traffic.status', status: 'completed', data: getTraffic() }); return true; }
  const propagated = request?.headers?.['x-elera-drain-propagated'] === 'true';
  if (method === 'POST' && path === '/api/v1/traffic/drain') { setDrain(true, propagated); response.json(200, { ok: true, operation: 'traffic.drain', changed: true, status: 'completed' }); return true; }
  if (method === 'POST' && path === '/api/v1/traffic/undrain') { setDrain(false, propagated); response.json(200, { ok: true, operation: 'traffic.undrain', changed: true, status: 'completed' }); return true; }
  return false;
}
