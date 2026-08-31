import http from 'node:http';
import { once } from 'node:events';

async function readRequestBody(request) {
  const chunks = [];
  request.on('data', (chunk) => chunks.push(chunk));
  await once(request, 'end');
  return Buffer.concat(chunks).toString('utf8');
}

export function createStartupEvidenceServer({ port, evidence, lease, completion, token, log = {} } = {}) {
  if (!Number.isInteger(port) || typeof evidence !== 'function') throw new TypeError('startup evidence server dependencies are required');
  const server = http.createServer(async (request, response) => {
    if (request.method === 'GET' && request.url === '/healthz') { response.writeHead(200, { 'content-type': 'text/plain' }).end('ok\n'); return; }
    if (request.method === 'GET' && request.url === '/readyz') { response.writeHead(503, { 'content-type': 'text/plain' }).end('not ready\n'); return; }
    if (request.method === 'POST' && request.url === '/api/v1/cluster/cold-bootstrap/lease') {
      const body = await readRequestBody(request);
      if (token && request.headers.authorization !== `Bearer ${token}`) { response.writeHead(401).end(); return; }
      if (!lease) { response.writeHead(503).end(); return; }
      try {
        const data = await lease.claim(JSON.parse(body));
        response.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ ok: true, data }));
      } catch (error) { response.writeHead(error.statusCode ?? 400).end(JSON.stringify({ ok: false, error: error.message })); }
      return;
    }
    if (request.method === 'GET' && request.url === '/api/v1/cluster/cold-bootstrap/completion') {
      if (token && request.headers.authorization !== `Bearer ${token}`) { response.writeHead(401).end(); return; }
      const data = completion?.read();
      if (!data) { response.writeHead(404).end(); return; }
      response.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ ok: true, data }));
      return;
    }
    if (request.method !== 'GET' || request.url !== '/api/v1/cluster/cold-bootstrap/evidence') { response.writeHead(404).end(); return; }
    if (token && request.headers.authorization !== `Bearer ${token}`) { response.writeHead(401).end(); return; }
    try { const data = await evidence(); response.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ ok: true, data })); }
    catch (error) { log.warn?.('Startup evidence request failed', { error }); response.writeHead(503).end(JSON.stringify({ ok: false, error: error.message })); }
  });
  return {
    server,
    async listen() { await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, '0.0.0.0', resolve); }); },
    async close() {
      if (!server.listening) return;
      server.closeIdleConnections?.();
      server.closeAllConnections?.();
      await new Promise((resolve) => server.close(resolve));
    },
  };
}
