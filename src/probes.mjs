import http from 'node:http';

export function createProbeServer({ getStatus, controlHandler, log }) {
  return http.createServer(async (request, response) => {
    if (request.url?.startsWith('/api/v1/')) { await controlHandler(request, response); return; }
    if (request.url === '/healthz') { response.writeHead(200, { 'content-type': 'text/plain' }).end('ok\n'); return; }
    if (request.url !== '/readyz') { response.writeHead(404).end(); return; }
    try { const result = await getStatus(); response.writeHead(result.ready ? 200 : 503, { 'content-type': 'text/plain' }).end(result.ready ? 'ok\n' : 'not ready\n'); }
    catch (error) { log.warn('HTTP readiness probe failed', { error }); response.writeHead(503).end('not ready\n'); }
  });
}
