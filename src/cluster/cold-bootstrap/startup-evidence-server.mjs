import http from 'node:http';
import { createStartupEvidenceRoutes } from './startup-evidence-routes.mjs';

export function createStartupEvidenceServer({ port, evidence, lease, completion, token, log = {} } = {}) {
  if (!Number.isInteger(port) || typeof evidence !== 'function') throw new TypeError('startup evidence server dependencies are required');
  const handleRecoveryRoute = createStartupEvidenceRoutes({ evidence, lease, completion, token, log });
  const server = http.createServer(async (request, response) => {
    if (request.method === 'GET' && request.url === '/healthz') { response.writeHead(200, { 'content-type': 'text/plain' }).end('ok\n'); return; }
    if (request.method === 'GET' && request.url === '/readyz') { response.writeHead(503, { 'content-type': 'text/plain' }).end('not ready\n'); return; }
    if (await handleRecoveryRoute(request, response)) return;
    response.writeHead(404).end();
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
