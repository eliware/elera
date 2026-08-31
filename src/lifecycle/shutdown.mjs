export function createShutdown({ lifecycle, sqlQuiesce, drain, propagateDrain = async () => {}, beforeMariaStop = async () => {}, shutdownCondition, getTimers = () => [], routingBus, routingStream, telemetry, servers = [], closeServer = async () => {}, getMariaProcess = () => undefined, getDb = () => undefined, shutdownTimeoutMs = 60000, quiesceTimeoutMs = 30000, errors, log = {} } = {}) {
  if (!lifecycle?.set || !sqlQuiesce?.begin || !drain?.wait) throw new TypeError('shutdown dependencies are required');
  let started = false;
  return async function shutdown(signal) {
    if (started) { log.warn?.('Shutdown already in progress', { signal }); return { state: lifecycle.get?.() ?? 'stopping', repeated: true }; }
    started = true;
    lifecycle.set('draining');
    log.info?.('Supervisor shutting down', { signal });
    try { await propagateDrain(true); } catch (error) { log.warn?.('Shutdown drain propagation failed', { error }); }
    try {
      await routingStream?.shutdown?.({ reason: signal, reconnectDeadlineMs: shutdownTimeoutMs, ...(shutdownCondition ? { clusterCondition: shutdownCondition() } : {}) });
    } catch (error) {
      log.warn?.('Shutdown routing notification failed', { error });
    }
    await sqlQuiesce.begin(quiesceTimeoutMs);
    lifecycle.set('stopping');
    for (const timer of getTimers()) clearInterval(timer);
    routingBus?.close?.();
    routingStream?.close?.();
    telemetry?.stop?.();
    await Promise.all(servers.map((server) => closeServer(server)));
    await beforeMariaStop();
    const result = await getMariaProcess()?.stop?.(shutdownTimeoutMs);
    if (result?.forced) log.error?.('MariaDB required SIGKILL during shutdown', result);
    await getDb()?.close?.().catch?.((error) => log.error?.('Database pool close failed', { error }));
    errors?.removeHandlers?.();
    lifecycle.set('stopped');
    return { state: 'stopped', forced: Boolean(result?.forced) };
  };
}
