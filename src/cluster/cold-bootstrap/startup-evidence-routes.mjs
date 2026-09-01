import { once } from 'node:events';

async function readRequestBody(request) {
  const chunks = [];
  request.on('data', (chunk) => chunks.push(chunk));
  await once(request, 'end');
  return Buffer.concat(chunks).toString('utf8');
}

export function createStartupEvidenceRoutes({ evidence, lease, completion, token, log = {} } = {}) {
  if (typeof evidence !== 'function') throw new TypeError('startup evidence route dependencies are required');
  return async function handleStartupEvidenceRoute(request, response) {
    if (request.method === 'POST' && request.url === '/api/v1/cluster/cold-bootstrap/lease') {
      if (token && request.headers?.authorization !== `Bearer ${token}`) { response.writeHead(401).end(); return true; }
      const body = await readRequestBody(request);
      if (!lease) { response.writeHead(503).end(); return true; }
      try { const data = await lease.claim(JSON.parse(body)); response.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ ok: true, data })); }
      catch (error) { response.writeHead(error.statusCode ?? 400).end(JSON.stringify({ ok: false, error: error.message })); }
      return true;
    }
    if (request.method === 'GET' && request.url === '/api/v1/cluster/cold-bootstrap/completion') {
      if (token && request.headers?.authorization !== `Bearer ${token}`) { response.writeHead(401).end(); return true; }
      const data = completion?.read();
      if (!data) { response.writeHead(404).end(); return true; }
      response.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ ok: true, data }));
      return true;
    }
    if (request.method !== 'GET' || request.url !== '/api/v1/cluster/cold-bootstrap/evidence') return false;
    if (token && request.headers?.authorization !== `Bearer ${token}`) { response.writeHead(401).end(); return true; }
    try { const data = await evidence(); response.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ ok: true, data })); }
    catch (error) { log.warn?.('Startup evidence request failed', { error }); response.writeHead(503).end(JSON.stringify({ ok: false, error: error.message })); }
    return true;
  };
}
