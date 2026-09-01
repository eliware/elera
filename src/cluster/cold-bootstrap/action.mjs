export function createColdBootstrapAction({ processController, args, timeoutMs, log = {}, isBusy = () => false, setBusy = () => {} } = {}) {
  if (!processController || typeof processController.stop !== 'function' || typeof processController.start !== 'function' || !Array.isArray(args) || !Number.isFinite(timeoutMs) || timeoutMs <= 0) throw new TypeError('cold bootstrap action dependencies are required');
  const baseArgs = args.filter((arg) => arg !== '--wsrep-new-cluster' && arg !== '--wsrep-new-cluster=1');
  let running = false;
  return async function bootstrapExistingMember() {
    if (running || isBusy()) throw Object.assign(new Error('bootstrap already in progress'), { statusCode: 409 });
    running = true;
    setBusy(true);
    try {
      log.warn?.('Restarting MariaDB for cold Galera bootstrap');
      await processController.stop(timeoutMs);
      const bootstrapArgs = [...baseArgs, '--wsrep-new-cluster'];
      await processController.start(bootstrapArgs);
    } finally { running = false; setBusy(false); }
  };
}
