import { mkdir } from 'node:fs/promises';
import { exec } from './context.mjs';
import { runCli } from './cli.mjs';
export async function runBackup(environment) { await mkdir('/lab/backups/e2e', { recursive: true }); const backupEnvironment = { ...environment, ELERA_IDENTITY: 'backup-dev' }; await runCli(['backup', '/lab/backups/e2e', 'sample_app'], backupEnvironment); await runCli(['verify-backup', '/lab/backups/e2e'], backupEnvironment); await exec('scp', ['-i', '/lab/ssh/id_ed25519', '-o', 'StrictHostKeyChecking=no', '-r', '/lab/backups/e2e', 'root@backup-nas:/srv/backups/'], { env: environment }); return backupEnvironment; }
