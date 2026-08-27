import net from 'node:net';
import { calculateWeight } from './health.mjs';

export function agentReply(status, performance, drained) {
  if (drained || !status.ready) return '0%\n';
  return performance ? `ready ${calculateWeight(status.values)}%\n` : 'ready\n';
}

export function listenAgent({ port, performance, timeoutMs, getStatus, isDrained, log }) {
  const server = net.createServer((socket) => {
    socket.setTimeout(timeoutMs);
    getStatus()
      .then((status) => socket.end(agentReply(status, performance, isDrained())))
      .catch((error) => {
        log.warn('HAProxy agent check failed', { performance, error });
        socket.end('down\n');
      });
    /* istanbul ignore next -- defensive socket event plumbing is covered by live smoke tests. */
    socket.on('timeout', () => socket.destroy());
    /* istanbul ignore next -- defensive socket event plumbing is covered by live smoke tests. */
    socket.on('error', (error) => log.debug('Agent socket closed with error', { error }));
  });
  /* istanbul ignore next -- listener bind failures are covered by deployment smoke tests. */
  server.on('error', (error) => log.error('Agent listener failed', { port, performance, error }));
  server.listen(port, '0.0.0.0', () => log.info('HAProxy agent listener started', { port, performance }));
  return server;
}
