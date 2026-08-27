import { WebSocketServer } from 'ws';

export function createRoutingStream({ token, getEvent, bus, log }) {
  const server = new WebSocketServer({ noServer: true });
  server.on('connection', (socket, request) => {
    const application = new URL(request.url, 'http://localhost').searchParams.get('application') ?? 'default';
    const client = { send: (event) => socket.readyState === 1 && socket.send(JSON.stringify(event)), ping: () => socket.ping() };
    const unsubscribe = bus.subscribe(client, (event) => !event.application || event.application === application);
    const initial = getEvent(application); if (initial) client.send(initial);
    socket.on('close', unsubscribe);
    socket.on('error', (error) => log?.warn?.('Routing stream socket failed', { error }));
  });
  function upgrade(request, socket, head) {
    const supplied = request.headers.authorization?.match(/^Bearer\s+(.+)$/i)?.[1] ?? new URL(request.url, 'http://localhost').searchParams.get('token');
    if (!token || supplied !== token) { socket.write('HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n'); socket.destroy(); return false; }
    if (!new URL(request.url, 'http://localhost').pathname.startsWith('/api/v1/routing/stream')) return false;
    server.handleUpgrade(request, socket, head, (client) => server.emit('connection', client, request)); return true;
  }
  return { upgrade, close: () => server.close() };
}
