/* istanbul ignore file -- in-memory delivery orchestration is covered by focused contract tests. */
import { log as defaultLog } from '@eliware/common';

export function createRoutingEventBus({ heartbeatMs = 45000, log = defaultLog } = {}) {
  const clients = new Set();
  let last = null;
  function publish(event) {
    if (!event || typeof event !== 'object') throw new TypeError('routing event is required');
    last = event;
    for (const client of clients) {
      try { if (!client.filter || client.filter(event)) client.send(event); } catch (error) { log.warn?.('Routing event delivery failed', { error }); clients.delete(client); }
    }
  }
  function subscribe(client, filter) {
    if (!client || typeof client.send !== 'function') throw new TypeError('routing event client is required');
    client.filter = filter; clients.add(client);
    if (last && (!filter || filter(last))) client.send(last);
    return () => clients.delete(client);
  }
  const heartbeat = setInterval(() => {
    for (const client of clients) { try { client.ping?.(); } catch { clients.delete(client); } }
  }, heartbeatMs);
  heartbeat.unref?.();
  return { publish, subscribe, clientCount: () => clients.size, latest: () => last, close: () => clearInterval(heartbeat) };
}
