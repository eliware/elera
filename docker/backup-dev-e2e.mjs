import { environment } from './e2e/context.mjs';
import { initializeSupervisors } from './e2e/lifecycle.mjs';
import { provisionMetadata } from './e2e/metadata.mjs';
import { runBackup } from './e2e/backup.mjs';
import { exerciseRouting } from './e2e/routing.mjs';
import { runCli } from './e2e/cli.mjs';

console.log('[e2e] initializing supervisors');
await initializeSupervisors();
console.log('[e2e] provisioning metadata and credentials');
const scopedEnvironment = await provisionMetadata(environment);
const backupEnvironment = await runBackup(environment);
await exerciseRouting(scopedEnvironment);
await runCli(['restore-verify', '/lab/backups/e2e'], backupEnvironment);
console.log('[e2e] complete');
