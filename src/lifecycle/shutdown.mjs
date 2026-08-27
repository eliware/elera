export function createShutdown({ lifecycle, sqlQuiesce, drain, getTimers = () => [], routingBus, routingStream, servers = [], closeServer = async () => {}, getMariaProcess = () => undefined, getDb = () => undefined, shutdownTimeoutMs = 60000, errors, log = {} } = {}) {
  if (!lifecycle?.set || !sqlQuiesce?.begin || !drain?.wait) throw new TypeError('shutdown dependencies are required');
  let started = false;
  return async function shutdown(signal) {
    if (started) { log.warn?.('Shutdown already in progress', { signal }); return { state: lifecycle.get?.() ?? 'stopping', repeated: true }; }
    started = true;
    lifecycle.set('draining');
    log.info?.('Supervisor shutting down', { signal });
    await sqlQuiesce.begin();
    lifecycle.set('stopping');
    for (const timer of getTimers()) clearInterval(timer);
    routingBus?.close?.();
    routingStream?.close?.();
    await drain.wait();
    await Promise.all(servers.map((server) => closeServer(server)));
    const result = await getMariaProcess()?.stop?.(shutdownTimeoutMs);
    if (result?.forced) log.error?.('MariaDB required SIGKILL during shutdown', result);
    await getDb()?.close?.().catch?.((error) => log.error?.('Database pool close failed', { error }));
    errors?.removeHandlers?.();
    lifecycle.set('stopped');
    return { state: 'stopped', forced: Boolean(result?.forced) };
  };
}
