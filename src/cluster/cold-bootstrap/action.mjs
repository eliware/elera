export function createColdBootstrapAction({ processController, args, timeoutMs, log = {}, isBusy = () => false, setBusy = () => {} } = {}) {
  if (!processController || !Array.isArray(args) || !Number.isFinite(timeoutMs)) throw new TypeError('cold bootstrap action dependencies are required');
  return async function bootstrapExistingMember() {
    if (isBusy()) throw Object.assign(new Error('bootstrap already in progress'), { statusCode: 409 });
    setBusy(true);
    try {
      log.warn?.('Restarting MariaDB for cold Galera bootstrap');
      await processController.stop(timeoutMs);
      const bootstrapArgs = [...args.filter((arg) => arg !== '--wsrep-new-cluster'), '--wsrep-new-cluster'];
      await processController.start(bootstrapArgs);
    } finally { setBusy(false); }
  };
}
