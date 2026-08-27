import http from 'node:http';

export function createProbeServer({ getStatus, controlHandler, upgradeHandler, isDraining = () => false, log }) {
  const server = http.createServer(async (request, response) => {
    if (request.url?.startsWith('/api/v1/')) { await controlHandler(request, response); return; }
    if (request.url === '/healthz') { response.writeHead(200, { 'content-type': 'text/plain' }).end('ok\n'); return; }
    if (request.url !== '/readyz') { response.writeHead(404).end(); return; }
    try { const result = await getStatus(); const ready = result.ready && !isDraining(); response.writeHead(ready ? 200 : 503, { 'content-type': 'text/plain' }).end(ready ? 'ok\n' : 'not ready\n'); }
    catch (error) { log.warn('HTTP readiness probe failed', { error }); response.writeHead(503).end('not ready\n'); }
  });
  /* istanbul ignore next -- upgrade behavior is covered by the WebSocket integration contract. */
  server.on('upgrade', (request, socket, head) => { if (!upgradeHandler?.(request, socket, head)) socket.destroy(); });
  return server;
}
