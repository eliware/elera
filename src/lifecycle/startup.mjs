export async function waitForSql({ health, timeoutMs, delayMs = 250, log }) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try { await health.status(); return true; }
    catch (error) { log?.debug('Waiting for MariaDB SQL readiness', { error: error.message }); await new Promise((resolve) => setTimeout(resolve, Math.min(delayMs, Math.max(1, deadline - Date.now())))); }
  }
  return false;
}

export function createEleraBootstrap({ processController, args, health, timeoutMs, log, isBusy, setBusy, dataDir, pathExists = existsSync }) {
  return async function bootstrap() {
    if (isBusy()) throw Object.assign(new Error('bootstrap already in progress'), { statusCode: 409 });
    const current = await health.status().catch(() => ({ ready: false }));
    if (current.ready) throw Object.assign(new Error('node is already ready; bootstrap refused'), { statusCode: 409 });
    if (dataDir && pathExists(join(dataDir, 'mysql'))) throw Object.assign(new Error('initialized data directory; bootstrap refused'), { statusCode: 409 });
    setBusy(true);
    try {
      log.warn('Restarting MariaDB for Elera bootstrap');
      await processController.stop(timeoutMs);
      const bootstrapArgs = [...args.filter((arg) => arg !== '--wsrep-new-cluster'), '--wsrep-new-cluster'];
      await processController.start(bootstrapArgs);
    } finally { setBusy(false); }
  };
}
import { existsSync } from 'node:fs';
import { join } from 'node:path';
