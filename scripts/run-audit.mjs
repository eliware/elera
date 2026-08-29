import { spawnSync } from 'node:child_process';

const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const environment = { ...process.env, npm_config_ignore_scripts: 'true' };
delete environment.npm_config_allow_scripts;
const result = spawnSync(npm, ['audit', '--omit=dev', '--audit-level=moderate', '--ignore-scripts'], {
  env: environment,
  stdio: 'inherit',
  shell: process.platform === 'win32',
});

if (result.error) throw result.error;
process.exit(result.status ?? 1);
