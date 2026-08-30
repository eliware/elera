import { WebSocketServer } from 'ws';

export function createRoutingStream({ token, authorize, nodeIdentity, getEvent, bus, telemetry, log, loadBalancerEndpoint, websocketServer = new WebSocketServer({ noServer: true, maxPayload: 64 * 1024 }) }) {
  const server = websocketServer;
  const sockets = new Set();
  let stopping = false;
  server.on('connection', (socket, request) => {
    if (stopping) { socket.close(1012, 'supervisor restarting'); return; }
    sockets.add(socket);
    const application = request.eleraAuthorization?.application
      ?? new URL(request.url, 'http://localhost').searchParams.get('application')
      ?? 'default';
    const client = { send: (event) => socket.readyState === 1 && socket.send(JSON.stringify(event)), ping: () => socket.ping() };
    const unsubscribe = bus.subscribe(client, (event) => !event.application || event.application === application);
    const initial = getEvent(application); if (initial) client.send(initial);
    socket.on('close', () => { sockets.delete(socket); unsubscribe(); });
    socket.on('message', (data) => { try { telemetry?.accept(JSON.parse(data.toString())); } catch (error) { log?.warn?.('Invalid routing telemetry message', { error }); } });
    socket.on('error', (error) => log?.warn?.('Routing stream socket failed', { error }));
  });
  async function upgrade(request, socket, head) {
    if (stopping) { socket.write('HTTP/1.1 503 Service Unavailable\r\nConnection: close\r\n\r\n'); socket.destroy(); return false; }
    const supplied = request.headers.authorization?.match(/^Bearer\s+(.+)$/i)?.[1];
    const url = new URL(request.url, 'http://localhost');
    if (!url.pathname.startsWith('/api/v1/routing/stream')) return false;
    const permitted = authorize ? await authorize(supplied, url.searchParams.get('application')) : Boolean(token && supplied === token);
    if (!permitted) { socket.write('HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n'); socket.destroy(); return false; }
    request.eleraAuthorization = permitted;
    server.handleUpgrade(request, socket, head, (client) => server.emit('connection', client, request)); return true;
  }
  async function shutdown(event = {}, { code = 1012, reason = 'supervisor restarting' } = {}) {
    stopping = true;
    const payload = JSON.stringify({ type: 'routing.shutdown', reconnect: true, ...(nodeIdentity ? { nodeIdentity } : {}), ...(loadBalancerEndpoint ? { loadBalancerEndpoint } : {}), ...event });
    await Promise.all([...sockets].map((socket) => new Promise((resolve) => {
      if (socket.readyState !== 1) { resolve(); return; }
      try { socket.send(payload, () => { socket.close(code, reason); resolve(); }); } catch { socket.close(code, reason); resolve(); }
    })));
  }
  return { upgrade, shutdown, close: () => { stopping = true; for (const socket of sockets) socket.close(1012, 'supervisor restarting'); return server.close(); }, isStopping: () => stopping };
}
