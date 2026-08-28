import { environment } from './e2e/context.mjs';
import { initializeSupervisors } from './e2e/lifecycle.mjs';
import { provisionMetadata } from './e2e/metadata.mjs';
import { runBackup } from './e2e/backup.mjs';
import { exerciseRouting } from './e2e/routing.mjs';
import { runCli } from './e2e/cli.mjs';
import { fileURLToPath } from 'node:url';

const debug = process.env.ELERA_E2E_DEBUG === '1';
const log = (...args) => { if (debug) console.error(...args); };

export async function runBackupE2E() {
  log('[e2e] initializing supervisors');
  await initializeSupervisors();
  log('[e2e] provisioning metadata and credentials');
  const { appEnvironment, restoreEnvironment } = await provisionMetadata(environment);
  await runBackup(environment);
  await exerciseRouting(appEnvironment);
  await runCli(['restore-verify', '/lab/backups/e2e/1'], restoreEnvironment);
  log('[e2e] completed');
  return { completed: true };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await runBackupE2E();
